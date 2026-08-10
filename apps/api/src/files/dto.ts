import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

export class UploadFileQuery {
  @IsString() @MaxLength(60) entityKind!: string;
  @IsOptional() @IsUUID() entityId?: string;
}

export class ListFilesQuery {
  @IsString() @MaxLength(60) entityKind!: string;
  @IsOptional() @IsUUID() entityId?: string;
}

export class IdParam {
  @IsUUID() id!: string;
}
