// Data models matching production Entity Framework models (PascalCase)
export interface Lock {
  Id: number;
  LockName?: string;
  AlbumTitle?: string;
  SealDate?: string;
  NotifiedWhenScanned: boolean;
  ScanCount: number;
  CreatedAt: string;
  UserId?: number;
}

export interface MediaObject {
  Id: number;
  LockId: number;
  CloudflareImageId: string;
  Url: string;
  FileName?: string;
  MediaType: string;
  IsMainPicture: boolean;
  CreatedAt: string;
}

export interface EnhancedMediaObject extends MediaObject {
  urls?: {
    public?: string;
    profile?: string;
  };
}

export interface LockWithMedia extends Lock {
  media: MediaObject[];
}

// Response interfaces
export interface AlbumResponse {
  lockName: string;
  albumTitle: string;
  sealDate?: string;
  media: EnhancedMediaObject[];
}

// Request interfaces for lock updates
export interface UpdateLockRequest {
  lockName?: string;
  albumTitle?: string;
  sealDate?: string;
  notifiedWhenScanned?: boolean;
}

export interface BulkLockGenerationRequest {
  count: number;
  prefix?: string;
}

export interface BulkLockGenerationResponse {
  success: true;
  message: string;
  generated: number;
  startId: number;
  endId: number;
}