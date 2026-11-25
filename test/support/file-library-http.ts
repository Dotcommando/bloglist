interface IFixtureFile {
  readonly fileId: string;
  readonly folderId: string | null;
  readonly mimeType: string;
  readonly name: string;
}

interface IFixtureFolder {
  readonly folderId: string;
  readonly parentId: string | null;
  readonly root?: string;
  readonly name: string;
}

/** Serves the Files read endpoints from an in-memory browser fixture. */
export function fileLibraryResponse<TFile extends IFixtureFile>(
  params: URLSearchParams,
  library: {
    readonly version: string;
    readonly pending: boolean;
    readonly files: readonly TFile[];
    readonly folders: readonly IFixtureFolder[];
  },
): unknown {
  const id = params.get('fileId');

  if (id) {
    return library.files.find((file) => file.fileId === id) ?? null;
  }

  const root = params.get('root');

  if (!root) {
    return library;
  }

  const parent = params.get('folderId');
  const query = params.get('search')?.toLowerCase() ?? '';
  const foldersOnly = params.has('foldersOnly');
  const folders = library.folders.filter((folder) => (folder.root ?? 'images') === root
    && folder.parentId === parent && folder.name.toLowerCase().includes(query));
  const files = foldersOnly ? [] : library.files.filter((file) =>
    (file.mimeType.startsWith('image/') ? 'images' : 'files') === root
    && file.folderId === parent && file.name.toLowerCase().includes(query));
  const breadcrumbs: IFixtureFolder[] = [];
  let folder = library.folders.find((item) => item.folderId === parent);

  while (folder) {
    breadcrumbs.unshift(folder);
    const ancestor = folder.parentId;

    folder = library.folders.find((item) => item.folderId === ancestor);
  }

  const page = Number(params.get('page') ?? 1);
  const pageSize = Number(params.get('pageSize') ?? 25);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return {
    version: library.version,
    pending: library.pending,
    folders: folders.slice(start, end),
    files: files.slice(Math.max(0, start - folders.length), Math.max(0, end - folders.length)),
    total: folders.length + files.length,
    folderTotal: folders.length,
    fileTotal: files.length,
    breadcrumbs,
    paths: {},
  };
}
