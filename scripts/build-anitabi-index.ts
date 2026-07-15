import {
  ANITABI_STATIC_CATALOG_URL,
  decodeAnitabiStaticCatalog,
  toAnitabiIndexFile,
} from '../libs/services/pilgrimage/anitabi-static-data';

const OUTPUT_PATH = 'libs/services/pilgrimage/anitabi-index.data.json';

const response = await fetch(ANITABI_STATIC_CATALOG_URL, {
  headers: { Accept: 'application/json', Referer: 'https://www.anitabi.cn/' },
});
if (!response.ok) {
  throw new Error(`Failed to fetch Anitabi static catalog: HTTP ${response.status}`);
}

const catalog = decodeAnitabiStaticCatalog(await response.json());
const index = toAnitabiIndexFile(catalog);
await Bun.write(OUTPUT_PATH, `${JSON.stringify(index, null, 2)}\n`);

console.log(`Wrote ${index.entries.length} Anitabi entries to ${OUTPUT_PATH}`);
