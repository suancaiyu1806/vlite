import crypto from 'crypto';
import { Context, File, Plugin } from './types.ts';
import typescript from './plugins/typescript.ts';
import css from './plugins/css.ts';
import vue from './plugins/vue.ts';
import { createLogger } from './utils.ts';
import esm from './plugins/esm.ts';

export const shared = 'shared';

// SFC <-> BFS
// - `\x00\x00<filename1>\x00<content1>\x00\x00<filename2>\x00<content2>\x00\x00...`
// - filenames should be sorted before calculating hash
// - binary files (later)

const sortFiles = (files: File[]): File[] => {
  return files.sort((a, b) => a.name < b.name ? -1 : 1)
}

export const extract = (content: string): {
  files: File[]
  hash: string
  content: string
} => {
  const files = content.split('\x00\x00').map(item => {
    const [filename, itemContent] = item.split('\x00')
    if (filename && itemContent) {
      return { name: filename, content: itemContent }
    }
  }).filter(Boolean) as File[]

  const normalizedContent = compress(files)

  const hash = crypto.createHash('sha256').update(normalizedContent).digest('hex')

  return {
    files,
    hash,
    content: normalizedContent
  };
};

export const compress = (files: File[], skipSorting?: boolean): string => {
  if (!skipSorting) {
    sortFiles(files)
  }
  return files.map(file => `${file.name}\x00${file.content}`).join('\x00\x00');
}

// BFS -> ESM
// - ts/jsx -> tsc
// - css/less (later)/sass (later)/css modules -> dom insert & export class names
// - assets (later) -> binary & export url

const plugins: Plugin[] = [
  typescript(),
  css(),
  vue(),
  esm(),
];

export const compileFile = async (file: File, context?: Context): Promise<File> => {
  const logger = createLogger('compileFile', context)
  logger.log('[start]', file.name)
  logger.log(file.content)
  let currentFile: File = file
  const defaultPlugin: Plugin = {
    name: 'default',
    resolveId: context?.defaultResolver,
    load: context?.defaultLoader,
  }
  for await (const plugin of [defaultPlugin, ...plugins]) {
    if (plugin.resolveId) {
      const resolvedId = await plugin.resolveId(currentFile.name, context)
      logger.log('[resolvedId]', currentFile.name)
      logger.log(resolvedId)
      if (resolvedId) {
        const loadedContent = plugin.load && await plugin.load(resolvedId, context) || currentFile.content
        logger.log('[load]', resolvedId)
        logger.log(loadedContent)
        currentFile = plugin.transform && await plugin.transform({ name: resolvedId, content: loadedContent }, context) || {
          name: resolvedId,
          content: loadedContent,
        }
        logger.log('[transform]', currentFile.name)
        logger.log(currentFile.content)
      }
    }
  }
  logger.log('[done]', currentFile.name)
  logger.log(currentFile.content)
  return currentFile
}

export const compile = async (files: File[], context?: Context): Promise<File[]> => {
  const compiledFiles: File[] = []
  await Promise.all(files.map(async (file): Promise<void> => {
    compiledFiles.push(await compileFile(file, context))
  }))
  return compiledFiles;
}

// ESM

export const install = async (name: string, version: string): Promise<void> => {
  // TODO:
  name
  version
}
