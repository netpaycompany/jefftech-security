"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { FolderOpen, ImagePlus, Images, LockKeyhole, Search, Trash2, UnlockKeyhole, X } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useVault } from "@/components/vault/vault-provider";
import {
  decryptPhoto,
  deleteEncryptedPhoto,
  getPhotoLibraryStatus,
  listEncryptedPhotos,
  preparePhotoLibrary,
  saveEncryptedPhoto,
  type PhotoKey,
  type PhotoMetadata,
} from "@/lib/photo-library";

type LibraryMode = "loading" | "legacy" | "unavailable" | "unlocked";
type GalleryPhoto = PhotoMetadata & { previewUrl: string };

export default function PhotosPage() {
  const { session } = useVault();
  return (
    <AppShell title="Private Photos" activePath="/photos">
      {session ? (
        <PhotoLibrary key={session.keyVersion} sessionKey={session.key} keyVersion={session.keyVersion} />
      ) : (
        <section className="mx-auto max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <h2 className="mt-5 text-2xl font-semibold text-white">Unlock your vault</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            Unlock your vault to access Photos. The same vault password protects your other private features.
          </p>
          <Link href="/master-password?next=%2Fphotos" className="mt-6 inline-flex rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500">
            Unlock vault
          </Link>
        </section>
      )}
    </AppShell>
  );
}

function PhotoLibrary({ sessionKey, keyVersion }: { sessionKey: PhotoKey; keyVersion: string }) {
  const [libraryMode, setLibraryMode] = useState<LibraryMode>("loading");
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<GalleryPhoto | null>(null);
  const [query, setQuery] = useState("");
  const [legacyPassphrase, setLegacyPassphrase] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const photoUrls = useRef(new Set<string>());

  useEffect(() => {
    let isMounted = true;
    const loadLibrary = async () => {
      const status = await getPhotoLibraryStatus();
      if (!isMounted) return;
      if (status === "legacy") {
        setLibraryMode("legacy");
        return;
      }

      await preparePhotoLibrary(sessionKey, keyVersion);
      const loadedPhotos = await loadGallery(sessionKey);
      if (!isMounted) {
        loadedPhotos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
        return;
      }
      photoUrls.current = new Set(loadedPhotos.map((photo) => photo.previewUrl));
      setPhotos(loadedPhotos);
      setLibraryMode("unlocked");
    };

    void loadLibrary().catch((caughtError: unknown) => {
      if (isMounted) {
        setLibraryMode("unavailable");
        setError(caughtError instanceof Error ? caughtError.message : "Private photo storage is unavailable in this browser.");
      }
    });

    return () => {
      isMounted = false;
      photoUrls.current.forEach((url) => URL.revokeObjectURL(url));
      photoUrls.current.clear();
    };
  }, [sessionKey, keyVersion]);

  const replacePhotos = (nextPhotos: GalleryPhoto[]) => {
    photoUrls.current.forEach((url) => URL.revokeObjectURL(url));
    photoUrls.current = new Set(nextPhotos.map((photo) => photo.previewUrl));
    setPhotos(nextPhotos);
  };

  const filteredPhotos = photos.filter((photo) => photo.name.toLowerCase().includes(query.trim().toLowerCase()));

  const handleUnlock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setIsBusy(true);
    try {
      await preparePhotoLibrary(sessionKey, keyVersion, legacyPassphrase);
      const loadedPhotos = await loadGallery(sessionKey);
      replacePhotos(loadedPhotos);
      setLegacyPassphrase("");
      setLibraryMode("unlocked");
      setNotice("Photos migrated to your vault encryption.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not migrate the existing photo library.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const isFolderImport = event.currentTarget.hasAttribute("webkitdirectory");
    const selectedFiles = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (selectedFiles.length === 0) {
      return;
    }

    const files = selectedFiles.filter((file) => file.type.startsWith("image/"));
    const skippedCount = selectedFiles.length - files.length;
    if (files.length === 0) {
      setError("No image files were found in that selection.");
      setNotice("");
      return;
    }

    setIsBusy(true);
    setError("");
    setNotice("");
    const failures: string[] = [];
    let savedCount = 0;

    try {
      for (const file of files) {
        try {
          await saveEncryptedPhoto(file, sessionKey);
          savedCount += 1;
        } catch (caughtError) {
          failures.push(caughtError instanceof Error ? caughtError.message : `Could not save ${file.name}.`);
        }
      }

      const loadedPhotos = await loadGallery(sessionKey);
      replacePhotos(loadedPhotos);
      if (savedCount > 0) {
        setNotice(`${savedCount} photo${savedCount === 1 ? "" : "s"} encrypted and saved in this browser.`);
      }
      if (failures.length > 0) {
        setError(failures.join(" "));
      }
      if (skippedCount > 0) {
        setError(`${skippedCount} non-image file${skippedCount === 1 ? " was" : "s were"} skipped.`);
      }
      if (savedCount > 0 && isFolderImport) {
        setNotice(`${savedCount} photo${savedCount === 1 ? "" : "s"} imported from the selected folder and encrypted.`);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not load the saved photos.");
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async (photo: GalleryPhoto) => {
    try {
      await deleteEncryptedPhoto(photo.id);
      setPhotos((currentPhotos) => currentPhotos.filter((currentPhoto) => currentPhoto.id !== photo.id));
      URL.revokeObjectURL(photo.previewUrl);
      photoUrls.current.delete(photo.previewUrl);
      setSelectedPhoto(null);
      setNotice(`${photo.name} was deleted from this browser.`);
      setError("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not delete this photo.");
    }
  };

  return (
    <>
      {libraryMode === "loading" ? (
        <p className="py-16 text-center text-sm text-slate-400">Checking private photo storage...</p>
      ) : libraryMode !== "unlocked" ? (
        <section className="mx-auto max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10 text-blue-300">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <p className="mt-6 text-xs uppercase tracking-[0.2em] text-blue-300">Encrypted photo library</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">
            {libraryMode === "unavailable"
              ? "Storage unavailable"
              : libraryMode === "legacy"
                ? "Migrate existing photos"
                : "Private photos"}
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            {libraryMode === "legacy"
              ? "This browser has photos encrypted with the previous photo passphrase. Enter it once to migrate them to your vault encryption; future access uses only your vault password."
              : "Photos are encrypted on this device using your vault key and are not synced to the cloud."}
          </p>

          {libraryMode === "legacy" && (
            <form onSubmit={handleUnlock} className="mt-6 space-y-4">
              <div>
                <label htmlFor="legacy-photo-passphrase" className="mb-2 block text-sm text-slate-300">
                  Previous photo passphrase
                </label>
                <input
                  id="legacy-photo-passphrase"
                  type="password"
                  value={legacyPassphrase}
                  onChange={(event) => setLegacyPassphrase(event.target.value)}
                  autoComplete="current-password"
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-blue-500"
                />
              </div>
              {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
              <Button type="submit" className="w-full" disabled={isBusy}>
                {isBusy ? "Migrating photos..." : "Migrate to vault encryption"}
                <UnlockKeyhole className="ml-2 h-4 w-4" />
              </Button>
            </form>
          )}
          {libraryMode === "unavailable" && error && <p role="alert" className="mt-5 text-sm text-red-300">{error}</p>}
        </section>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-blue-300">On this device · encrypted</p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Your photos</h2>
              <p className="mt-2 text-sm text-slate-400">{photos.length} private photo{photos.length === 1 ? "" : "s"}</p>
              <p className="mt-2 text-xs text-slate-500">Encrypted with your vault key on this device. Photos are not synced to the cloud.</p>
              <p className="mt-2 text-xs text-slate-400">
                Use Import folder to add its images at once where supported, or Add photos to choose files. Only the selected folder or files are accessed.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl border border-slate-700 px-4 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-900">
                <FolderOpen className="mr-2 h-4 w-4" />
                Import folder
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  ref={(element) => {
                    element?.setAttribute("webkitdirectory", "");
                    element?.setAttribute("directory", "");
                  }}
                  onChange={handleUpload}
                  className="sr-only"
                  disabled={isBusy}
                />
              </label>
              <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-medium text-white transition hover:bg-blue-500">
                <ImagePlus className="mr-2 h-4 w-4" />
                Add photos
                <input type="file" accept="image/*" multiple onChange={handleUpload} className="sr-only" disabled={isBusy} />
              </label>
            </div>
          </div>

          {notice && (
            <div role="status" className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-200">
              {notice}
            </div>
          )}
          {error && (
            <div role="alert" className="mb-4 rounded-xl border border-red-500/25 bg-red-500/5 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          )}

          {photos.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="relative w-full sm:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search photo names"
                  aria-label="Search photo names"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-blue-500"
                />
              </div>
              {isBusy && <p className="text-sm text-slate-400">Encrypting photos...</p>}
            </div>
          )}

          {photos.length === 0 ? (
            <section className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 px-6 py-16 text-center">
              <Images className="mx-auto h-8 w-8 text-slate-500" />
              <h3 className="mt-4 text-lg font-medium text-white">Your library is ready</h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
                Add photos from this device. They will be encrypted with your vault key before being saved to this browser.
              </p>
            </section>
          ) : filteredPhotos.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-400">No photos match that search.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {filteredPhotos.map((photo) => (
                <article key={photo.id} className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
                  <button
                    type="button"
                    onClick={() => setSelectedPhoto(photo)}
                    aria-label={`Open ${photo.name}`}
                    className="block aspect-[4/3] w-full overflow-hidden bg-slate-950"
                  >
                    <Image
                      src={photo.previewUrl}
                      alt={photo.name}
                      width={640}
                      height={480}
                      unoptimized
                      className="h-full w-full object-cover transition duration-300 hover:scale-[1.03]"
                    />
                  </button>
                  <div className="flex items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-200">{photo.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatDate(photo.createdAt)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDelete(photo)}
                      aria-label={`Delete ${photo.name}`}
                      title="Delete photo"
                      className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-red-500/10 hover:text-red-200"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-label={selectedPhoto.name} className="w-full max-w-5xl">
            <div className="mb-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate font-medium text-white">{selectedPhoto.name}</p>
                <p className="text-sm text-slate-400">{formatDate(selectedPhoto.createdAt)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button type="button" variant="secondary" onClick={() => void handleDelete(selectedPhoto)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
                <button
                  type="button"
                  onClick={() => setSelectedPhoto(null)}
                  aria-label="Close photo"
                  className="rounded-lg border border-slate-700 p-2 text-slate-200 hover:bg-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="flex max-h-[80vh] min-h-40 items-center justify-center overflow-hidden rounded-lg bg-black">
              <Image
                src={selectedPhoto.previewUrl}
                alt={selectedPhoto.name}
                width={1600}
                height={1200}
                unoptimized
                className="max-h-[80vh] w-auto max-w-full object-contain"
              />
            </div>
          </section>
        </div>
      )}

    </>
  );
}

async function loadGallery(key: PhotoKey): Promise<GalleryPhoto[]> {
  const records = await listEncryptedPhotos();
  const photos = await Promise.all(records.map(async (record) => {
    const decrypted = await decryptPhoto(record, key);
    return { ...decrypted.metadata, previewUrl: URL.createObjectURL(decrypted.blob) };
  }));

  return photos.sort((first, second) => second.createdAt.localeCompare(first.createdAt));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
}
