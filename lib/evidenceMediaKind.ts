const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'm4v', 'webm']);

export type EvidenceMediaKind = 'image' | 'video';

export function extensionForEvidenceMediaKind(kind: EvidenceMediaKind): string {
  return kind === 'video' ? 'mp4' : 'jpg';
}

export function inferEvidenceMediaKindFromPath(pathOrUri: string | null | undefined): EvidenceMediaKind {
  const raw = pathOrUri?.trim();
  if (!raw) return 'image';
  const base = raw.split('?')[0]?.split('#')[0] ?? raw;
  const dot = base.lastIndexOf('.');
  if (dot < 0) return 'image';
  const ext = base.slice(dot + 1).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext) ? 'video' : 'image';
}

export function contentTypeForEvidenceMediaKind(kind: EvidenceMediaKind, uri?: string): string {
  if (kind === 'image') {
    const hint = uri ? inferEvidenceMediaKindFromPath(uri) : 'image';
    if (hint === 'video') return 'video/mp4';
    const base = uri?.split('?')[0]?.toLowerCase() ?? '';
    if (base.endsWith('.png')) return 'image/png';
    if (base.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }
  const base = uri?.split('?')[0]?.toLowerCase() ?? '';
  if (base.endsWith('.mov')) return 'video/quicktime';
  if (base.endsWith('.m4v')) return 'video/x-m4v';
  if (base.endsWith('.webm')) return 'video/webm';
  return 'video/mp4';
}

export function extensionForEvidenceContentType(contentType: string): string {
  const ct = contentType.toLowerCase();
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('quicktime')) return 'mov';
  if (ct.includes('m4v')) return 'm4v';
  if (ct.includes('webm')) return 'webm';
  if (ct.startsWith('video/')) return 'mp4';
  return 'jpg';
}
