import { createWriteStream } from 'fs';
import { mkdir, stat } from 'fs/promises';
import { dirname, resolve } from 'path';
import { Readable } from 'stream';
import { ReadableStream } from 'stream/web';
import { finished } from 'stream/promises';
import { Transformer, baseJsPaths } from 'markmap-lib';
import {
  ASSETS_PREFIX,
  addToolbar,
  assetsDirPromise,
  localProvider,
} from './util';

const providerName = 'local-hook';

export async function fetchAssets() {
  const transformer = new Transformer();
  const { provider } = transformer.urlBuilder;
  transformer.urlBuilder.setProvider(providerName, localProvider);
  transformer.urlBuilder.provider = providerName;
  let assets = transformer.getAssets();
  assets = addToolbar(transformer.urlBuilder, assets);
  delete transformer.urlBuilder.providers[providerName];
  transformer.urlBuilder.provider = provider;
  const pluginPaths = [
    ...(assets.scripts?.map(
      (item) => (item.type === 'script' && item.data.src) || '',
    ) || []),
    ...(assets.styles?.map(
      (item) => (item.type === 'stylesheet' && item.data.href) || '',
    ) || []),
  ]
    .filter((url) => url.startsWith(ASSETS_PREFIX))
    .map((url) => url.slice(ASSETS_PREFIX.length));
  const paths = [...baseJsPaths, ...pluginPaths];
  const assetsDir = await assetsDirPromise;
  const fastest = await transformer.urlBuilder.getFastestProvider();
  await Promise.all(
    paths.map((path) =>
      downloadAsset(
        resolve(assetsDir, path),
        transformer.urlBuilder.getFullUrl(path, fastest),
      ),
    ),
  );
}

async function downloadAsset(fullPath: string, url: string) {
  // console.log(`${url} -> ${fullPath}`);
  try {
    const result = await stat(fullPath);
    // Skip existing files
    if (result.isFile()) return;
  } catch {
    // ignore
  }
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Failed to download: ${url}`);
  await mkdir(dirname(fullPath), { recursive: true });
  await finished(
    Readable.fromWeb(res.body as ReadableStream).pipe(
      createWriteStream(fullPath),
    ),
  );
}
