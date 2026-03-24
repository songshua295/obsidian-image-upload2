import { Notice, Plugin, requestUrl, type TFile } from "obsidian";
import { DEFAULT_SETTINGS, SettingsTab, type Settings } from "./settings";
import { getDeletingFiles, transform } from "./transform";
import { upload } from "./upload";
import { createPromiseWithResolver, DeleteConfirmModal } from "./confirm-modal";

declare global {
    const cJS: () => Promise<unknown>;
}

export type PTFile = Pick<TFile, "basename" | "extension" | "name" | "path">;

export default class ImageUploadPlugin extends Plugin {
    settings: Settings;

    async onload() {
        await this.loadSettings();

        // 侧边栏图标提示汉化
        this.addRibbonIcon("image-up", "上传当前文件中的图片", () =>
            this.process(),
        );
        
        // 命令面板名称汉化
        this.addCommand({
            id: "upload-image-for-active-file",
            name: "上传当前文件中的图片",
            callback: () => this.process(),
        });

        this.addSettingTab(new SettingsTab(this.app, this));
    }

    onunload() {}

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async process() {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
            new Notice("当前没有打开的可活动文件");
            return;
        }
        const uploadedFiles = await this.uploadAndReplace(file);

        if (!uploadedFiles) {
            return;
        }

        new Notice(`已成功上传并替换 ${uploadedFiles.length} 个链接`);

        if (!uploadedFiles.length) {
            return;
        }

        await this.deleteUploadedFiles(uploadedFiles, file);
    }

    async uploadAndReplace(file: TFile) {
        const cachedMetadata = this.app.metadataCache.getFileCache(file);
        if (!cachedMetadata) {
            new Notice("缓存中未找到相关资源");
            return;
        }

        const { links, embeds } = cachedMetadata;

        if (!(links?.length || embeds?.length)) {
            new Notice("没有需要上传的内容");
            return;
        }

        const uploadedFiles = await asyncProcess(async (content: string) => {
            return transform(
                {
                    settings: this.settings,
                    uploader: await this.getUploader(),
                    readBinary: (...args) => this.app.vault.readBinary(...args),
                    resolveLink: (...args) =>
                        this.app.metadataCache.getFirstLinkpathDest(...args),
                    notice: (...args) => new Notice(...args),
                },
                content,
                {
                    selfPath: file.path,
                    links: links ?? [],
                    embeds: embeds ?? [],
                },
            );
        }, file);

        return uploadedFiles;
    }

    async deleteUploadedFiles(uploadedFiles: string[], file: TFile) {
        const filesToDelete = getDeletingFiles(
            uploadedFiles,
            this.app.metadataCache.resolvedLinks,
            file.path,
        );

        const { promise: confirmPromise, handler } = createPromiseWithResolver();
        new DeleteConfirmModal(this.app, handler, filesToDelete).open();
        try {
            await confirmPromise;
        } catch {
            new Notice("已取消删除操作");
            return;
        }

        for (const filePath of filesToDelete) {
            const file = this.app.vault.getFileByPath(filePath);
            if (!file) {
                console.warn("未找到文件:", filePath);
                continue;
            }
            // 使用系统回收站
            await this.app.vault.trash(file, this.settings.useSystemTrash);
        }
    }

    async getUploader(): Promise<
        (binary: ArrayBuffer, file: PTFile) => Promise<string>
    > {
        const { settings } = this;
        const className = settings.customUploaderClass;

        if (!className) {
            return async (binary, file) => {
                return upload(binary, file, {
                    settings,
                    requestUrl: (...args) => requestUrl(...args),
                });
            };
        }
        let cJsObj: unknown;
        try {
            cJsObj = await cJS();
        } catch (e) {
            new Notice("加载 Custom JS 失败");
            throw e;
        }

        if (!(cJsObj && typeof cJsObj === "object" && className in cJsObj)) {
            new Notice(`在 Custom JS 中未找到类 "${className}"`);
            throw new Error(`Class "${className}" not found in custom JS`);
        }
        const uploaderClass = (cJsObj as Record<string, unknown>)[className];

        if (
            !(
                uploaderClass &&
                typeof uploaderClass === "object" &&
                "upload" in uploaderClass &&
                typeof uploaderClass.upload === "function"
            )
        ) {
            new Notice(`在类 "${className}" 中未找到 "upload" 方法`);
            throw new Error(`Method "upload" not found in class "${className}`);
        }

        return async (binary, file) => {
            const result = await (
                uploaderClass as {
                    upload: (...args: unknown[]) => Promise<unknown>;
                }
            ).upload(binary, file);
            if (typeof result !== "string") {
                throw new Error("返回结果不是字符串类型");
            }
            return result;
        };
    }
}

async function asyncProcess<T>(
    action: (content: string) => Promise<[string, T]>,
    file: TFile,
): Promise<T> {
    new Notice("正在处理文件，完成后请勿手动修改文件内容");
    const content = await file.vault.cachedRead(file);
    const [newContent, other] = await action(content);
    await file.vault.process(file, (data) => {
        if (data !== content) {
            new Notice(
                "检测到文件在处理期间被修改。用户编辑的内容将被拼接在文件末尾",
            );
            return `${newContent}\n\`\`\`\n\n${data}\n\`\`\`\n`;
        }
        return newContent;
    });
    return other;
}