// AuthImage — renders an image whose source may be a protected `/api/images/*`
// URL. A plain <img> cannot send an `Authorization: Bearer` header, so after the
// image route became authenticated, those images must be fetched with the token
// and rendered from an object URL. External http(s)/protocol-relative URLs are
// passed straight through to the <img> tag.
import { useEffect, useState, type MouseEvent } from 'react';
import { getToken } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { isProtectedImage, ProtectedImageLoader } from './protectedImage';

export default function AuthImage({
  src,
  alt,
  className,
  loading = 'lazy',
  onClick,
}: {
  src: string;
  alt?: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  onClick?: (e: MouseEvent<HTMLImageElement>) => void;
}) {
  const { user } = useAuth();
  const token = getToken();
  // Any change in identity or credential re-authorizes the image: logout, token
  // change, or a switch to a different user all flip this key, which forces the
  // previous object URL to be revoked and (if still authenticated) re-fetched.
  const authKey = `${user?.id ?? ''}:${token ?? ''}`;

  // `null` means "still resolving" for a protected image; a string is ready to
  // render (either the original external URL or a blob URL we created).
  const [resolved, setResolved] = useState<string | null>(isProtectedImage(src) ? null : src);

  useEffect(() => {
    if (!isProtectedImage(src)) {
      setResolved(src);
      return;
    }

    setResolved(null);
    if (!token) return; // logged out → render nothing; cleanup below already revoked any prior URL

    const loader = new ProtectedImageLoader(src, token, {
      fetch: (url, init) => fetch(url, { headers: init.headers }),
      createObjectURL: (blob) => URL.createObjectURL(blob),
      revokeObjectURL: (url) => URL.revokeObjectURL(url),
    });
    loader.load(setResolved);
    return () => loader.dispose();
  }, [src, authKey]);

  if (resolved === null) return null;

  return <img src={resolved} alt={alt} className={className} loading={loading} onClick={onClick} />;
}
