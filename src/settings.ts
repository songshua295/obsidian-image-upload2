import { type App, PluginSettingTab, Setting } from "obsidian";
import type ImageUploadPlugin from "./main";


export type Settings = {
    s3: {
        endpoint: string;
        accKeyId: string;
        secretAccKey: string;
        bucket: string;
        keyTemplate: string;
        region: string;
        forcePathStyle: boolean;
        publicUrl: string;
    };
    customUploaderClass: string;
    uploadExt: string;
    useSystemTrash: boolean;
};

export { DEFAULT_SETTINGS } from "./constants";

export class SettingsTab extends PluginSettingTab {
    plugin: ImageUploadPlugin;

    constructor(app: App, plugin: ImageUploadPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName("支持的上传格式")
            .setDesc("允许上传的文件扩展名（多个请用逗号分隔，如：png, jpg, gif）")
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.uploadExt)
                    .onChange(async (value) => {
                        this.plugin.settings.uploadExt = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName("使用系统回收站")
            .setDesc('开启后，上传成功后的本地文件将移至系统回收站；关闭则移至库内的 ".trash" 隐藏文件夹')
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.useSystemTrash)
                    .onChange(async (value) => {
                        this.plugin.settings.useSystemTrash = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName("自定义上传器类名 (CustomJS)")
            .setDesc(
                "在 CustomJS 中定义的自定义上传类名。留空则默认使用 S3 上传",
            )
            .addText((text) =>
                text
                    .setValue(this.plugin.settings.customUploaderClass)
                    .onChange(async (value) => {
                        this.plugin.settings.customUploaderClass = value;
                        await this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl).setHeading().setName("S3 存储配置");

        this.addTextSetting(
            "服务地址 (Endpoint)",
            "S3 服务的 API 端点地址",
            () => this.plugin.settings.s3.endpoint,
            (value) => {
                this.plugin.settings.s3.endpoint = value;
            },
        );
        this.addTextSetting(
            "访问密钥 (Access Key)",
            "用于身份验证的 Access Key ID (AK)",
            () => this.plugin.settings.s3.accKeyId,
            (value) => {
                this.plugin.settings.s3.accKeyId = value;
            },
        );
        this.addTextSetting(
            "安全密钥 (Secret Key)",
            "用于身份验证的 Secret Access Key (SK)",
            () => this.plugin.settings.s3.secretAccKey,
            (value) => {
                this.plugin.settings.s3.secretAccKey = value;
            },
        );
        this.addTextSetting(
            "存储桶名称 (Bucket)",
            "上传文件所存放的存储桶名称",
            () => this.plugin.settings.s3.bucket,
            (value) => {
                this.plugin.settings.s3.bucket = value;
            },
        );
        this.addTextSetting(
            "存储路径模板 (Key Template)",
            "S3 目标路径模板，支持使用 {{}} 占位符。\n常用变量: year, month, day, random2, random6, name, md5 (文件内容哈希) 等。",
            () => this.plugin.settings.s3.keyTemplate,
            (value) => {
                this.plugin.settings.s3.keyTemplate = value;
            },
        );
        this.addTextSetting(
            "服务区域 (Region)",
            "S3 服务所在的地理区域（如 us-east-1）",
            () => this.plugin.settings.s3.region,
            (value) => {
                this.plugin.settings.s3.region = value;
            },
        );
        this.addTextSetting(
            "自定义访问域名 (Public URL)",
            "访问已上传文件的 URL 前缀（留空则尝试使用默认地址）",
            () => this.plugin.settings.s3.publicUrl ?? "",
            (value) => {
                this.plugin.settings.s3.publicUrl = value;
            },
        );

        containerEl.createEl("p", {
            text: "示例：若公开 URL 为 'https://example.com' 且模板为 '{{path}}'，则路径为 'path/to/img.jpg' 的文件可通过 'https://example.com/path/to/img.jpg' 访问。",
            cls: "setting-item-description",
        });

        new Setting(containerEl)
            .setName("强制路径风格 (Force Path Style)")
            .setDesc("是否强制使用路径风格访问（某些私有部署的 S3 服务如 MinIO 可能需要开启）")
            .addToggle((toggle) => {
                toggle
                    .setValue(this.plugin.settings.s3.forcePathStyle)
                    .onChange(async (value) => {
                        this.plugin.settings.s3.forcePathStyle = value;
                        await this.plugin.saveSettings();
                    });
            });
    }

    addTextSetting(
        name: string,
        desc: string,
        get: () => string,
        set: (value: string) => void,
    ): void {
        new Setting(this.containerEl)
            .setName(name)
            .setDesc(desc)
            .addText((text) =>
                text.setValue(get()).onChange(async (value) => {
                    set(value);
                    await this.plugin.saveSettings();
                }),
            );
    }
}