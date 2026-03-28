import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { requestUrl, TFile } from "obsidian";
import type { Settings } from "./settings";
import mime from "mime";
import { encode as encode62 } from "base62";
import { createHash } from "crypto";
import { Buffer } from "node:buffer";
import type { PTFile } from "./main";

export type UploadCtx = {
    settings: Settings;
    requestUrl: typeof requestUrl;
};

export async function upload(
    binary: ArrayBuffer,
    tFile: PTFile,
    ctx: UploadCtx,
): Promise<string> {
    const key = await generateKey(binary, tFile, ctx.settings.s3.keyTemplate);
    await s3Upload(binary, key, tFile.extension, ctx);
    let pubUrl = ctx.settings.s3.publicUrl;
    // 确保 URL 以 / 结尾
    pubUrl = pubUrl.endsWith("/") ? pubUrl : `${pubUrl}/`;
    return pubUrl + encodeURI(key);
}

type TemplateParams =
    | "year"
    | "month"
    | "day"
    | "random2"
    | "random6"
    | "base62_of_ms_from_day_start"
    | "path"
    | "name"
    | "basename"
    | "extension"
    | "sha256";

export async function generateKey(
    binary: ArrayBuffer,
    tFile: PTFile,
    keyTemplate: string,
): Promise<string> {
    const sha256Hash = await computeSHA256(binary);
    const now = new Date();
    const params: Record<TemplateParams, string> = {
        year: now.getFullYear().toString(),
        month: (now.getMonth() + 1).toString().padStart(2, "0"),
        day: now.getDate().toString().padStart(2, "0"),
        random2: randomStringGenerator(2),
        random6: randomStringGenerator(6),
        base62_of_ms_from_day_start: encode62(
            Date.now() - new Date().setHours(0, 0, 0, 0),
        ),
        path: tFile.path,
        name: tFile.name,
        basename: tFile.basename,
        extension: tFile.extension,
        sha256: sha256Hash,
    };

    return template(keyTemplate, params);
}

function template(str: string, params: Record<string, string>): string {
    return str.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
        return params[key] || match;
    });
}

async function computeSHA256(binary: ArrayBuffer): Promise<string> {
    try {
        const hashBuffer = await crypto.subtle.digest('SHA-256', binary);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    } catch (error) {
        console.warn('Web Crypto API不可用，回退到Node.js实现:', error);
        const buffer = Buffer.from(binary);
        return createHash("sha256").update(buffer).digest("hex");
    }
}

function randomStringGenerator(length: number) {
    const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

async function s3Upload(
    file: ArrayBuffer | string,
    key: string,
    ext: string,
    ctx: UploadCtx,
) {
    const config = ctx.settings.s3;
    const client = new S3Client({
        region: config.region,
        forcePathStyle: config.forcePathStyle,
        credentials: {
            accessKeyId: config.accKeyId,
            secretAccessKey: config.secretAccKey,
        },
        endpoint: config.endpoint,
    });

    const command = new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
    });

    const url = await getSignedUrl(client, command);

    const resp = await ctx.requestUrl({
        url,
        method: "PUT",
        body: file,
        contentType: mime.getType(ext) || "application/octet-stream",
        throw: false,
    });

    if (resp.status !== 200) {
        // 这里的错误会被 main.ts 中的 try-catch 捕获并提示给用户
        throw new Error(`文件上传失败，HTTP 状态码: ${resp.status}`);
    }
}