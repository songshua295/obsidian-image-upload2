export type PromiseHandler = ReturnType<
    typeof createPromiseWithResolver
>["handler"];
import { Modal, Setting, type App } from "obsidian";

export function createPromiseWithResolver() {
    let resolvePromise: (value: unknown) => void;
    let rejectPromise: (reason: unknown) => void;

    const promise = new Promise((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
    });

    const resolver = (value: unknown) => {
        resolvePromise(value);
    };

    const rejecter = (reason: unknown) => {
        rejectPromise(reason);
    };

    return { promise, handler: { resolver, rejecter } };
}

export class ConfirmModal extends Modal {
    private handler: PromiseHandler;
    private needReject: boolean;
    constructor(app: App, handler: PromiseHandler) {
        super(app);
        this.handler = handler;
        this.needReject = true;
    }

    confirm(value?: unknown): void {
        this.handler.resolver(value);
        this.close();
    }
    cancel(reason?: Error): void {
        if (this.needReject) {
            this.handler.rejecter(reason ?? new Error("用户取消了操作"));
        }
        this.needReject = false;
    }
}

export class DeleteConfirmModal extends ConfirmModal {
    files: string[];
    constructor(app: App, handler: PromiseHandler, file: string[]) {
        super(app, handler);
        this.files = file;
    }
    onOpen(): void {
        const { contentEl } = this;
        contentEl.createEl("h2", {
            text: "确认删除这些文件吗？",
        });
        
        const desc = contentEl.createEl("p", {
            text: "上传成功后，以下本地文件将被移至回收站：",
            cls: "setting-item-description"
        });

        const ul = contentEl.createEl("ul");
        ul.addClass("image-upload-file-list"); // 建议添加类名方便以后调 CSS
        for (const file of this.files) {
            ul.createEl("li", { text: file });
        }

        new Setting(contentEl)
            .addButton((button) => {
                button
                    .setButtonText("确认删除")
                    .setWarning() // 设置为警告样式（红色），提醒用户这是删除操作
                    .onClick(() => {
                        this.confirm();
                    });
            })
            .addButton((button) => {
                button
                    .setButtonText("保留文件")
                    .onClick(() => {
                        this.close(); // 触发 onClose 逻辑，即 cancel()
                    });
            });
    }
    onClose(): void {
        this.cancel();
    }
}