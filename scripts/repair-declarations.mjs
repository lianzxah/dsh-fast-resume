/** Keep emitted upstream declarations portable to NodeNext consumers without source aliases. */
import { readdir, readFile, writeFile, access } from 'node:fs/promises'
import { dirname, relative, resolve, join } from 'node:path'
export async function repairDeclarations(root) {
 async function visit(directory) {
  for (const entry of await readdir(directory,{withFileTypes:true})) {
   const filename=join(directory,entry.name)
   if(entry.isDirectory()){await visit(filename);continue}
   if(!filename.endsWith('.d.ts'))continue
   let source=await readFile(filename,'utf8')
   const specifiers=[...source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)].map(match=>match[1])
   for(const specifier of new Set(specifiers)) {
    let replacement=specifier
    const aliases={'@resume-editor/shared':'upstream/shared/src/index.js','@resume-editor/canvas-engine':'upstream/canvas-engine/src/index.js','@resume-editor/templates':'upstream/templates/src/index.js'}
    if(aliases[specifier]) {replacement=relative(dirname(filename),resolve(root,aliases[specifier])).replaceAll('\\','/');if(!replacement.startsWith('.'))replacement='./'+replacement}
    else if(specifier.startsWith('.')) {
     if(specifier.endsWith('.ts'))replacement=specifier.slice(0,-3)+'.js'
     else if(!/\.(?:js|mjs|json)$/.test(specifier)) {
      try{await access(resolve(dirname(filename),specifier+'.d.ts'));replacement=specifier+'.js'}
      catch(error){try{await access(resolve(dirname(filename),specifier,'index.d.ts'));replacement=specifier+'/index.js'}catch(missing){throw new Error(`Unresolved declaration ${filename}: ${specifier}`,{cause:missing})}}
     }
    }
    if(replacement!==specifier)source=source.replaceAll(`'${specifier}'`,`'${replacement}'`).replaceAll(`"${specifier}"`,`"${replacement}"`)
   }
   await writeFile(filename,source)
  }
 }
 await visit(root)
}
