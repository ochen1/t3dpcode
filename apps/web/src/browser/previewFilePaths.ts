import {
  isWorkspaceImagePreviewPath,
  isWorkspacePreviewEntryPath,
} from "@t3tools/shared/filePreview";

export const isBrowserPreviewFile = (path: string): boolean => isWorkspacePreviewEntryPath(path);

export const isBrowserPreviewImageFile = (path: string): boolean =>
  isWorkspaceImagePreviewPath(path);
