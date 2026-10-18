/** Self-contained opaque srcdoc plus Harness ModuleLoader factory with shared shell React. */
import {build} from 'esbuild'
import {readFile,writeFile,mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import postcss from 'postcss'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
const alias={'@':resolve('upstream/editor/src'),'@resume-editor/shared':resolve('upstream/shared/src/index.ts'),'@resume-editor/templates':resolve('upstream/templates/src/index.ts'),'@resume-editor/canvas-engine':resolve('upstream/canvas-engine/src/index.ts')}
export async function buildBrowser(){
 const editor=await build({entryPoints:['src/editor/main.tsx'],bundle:true,platform:'browser',format:'iife',target:'es2022',write:false,minify:true,alias,define:{'process.env.NODE_ENV':'"production"'},tsconfig:'tsconfig.browser.json',metafile:true})
 const reachable=Object.keys(editor.metafile.inputs)
 for(const forbidden of ['auth-store','LoginPage','HomePage','AiAssistantPanel','lib/api.ts'])if(reachable.some(p=>p.includes('upstream/editor')&&p.includes(forbidden)))throw Error(`Editor pulls prohibited upstream account/model runtime: ${forbidden}`)
 const colors=['background','foreground','card','popover','primary','secondary','muted','accent','destructive']
 const themeColors=Object.fromEntries(colors.map(c=>[c,{DEFAULT:`hsl(var(--${c}) / <alpha-value>)`,foreground:`hsl(var(--${c}-foreground) / <alpha-value>)`}]))
 for(const c of ['border','input','ring'])themeColors[c]=`hsl(var(--${c}) / <alpha-value>)`
 const css=await postcss([tailwindcss({content:['./upstream/editor/src/components/**/*.{ts,tsx}','./upstream/canvas-engine/src/**/*.{ts,tsx}','./src/editor/**/*.{ts,tsx}'],theme:{extend:{colors:themeColors,borderRadius:{lg:'var(--radius)',md:'calc(var(--radius) - 2px)',sm:'calc(var(--radius) - 4px)'}}},darkMode:'class'}),autoprefixer]).process(await readFile('upstream/editor/src/styles/globals.css','utf8'),{from:undefined})
 await mkdir('assets',{recursive:true})
 const script=editor.outputFiles[0].text.replace(/<\/script/gi,'<\\/script')
 const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob: https: http:; font-src data:; connect-src 'none';"><style>${css.css}\n${await readFile('src/editor/styles.css','utf8')+'\n'+await readFile('src/editor/library.css','utf8')}</style></head><body><div id="root"></div><script>window.__FAST_RESUME_BOOTSTRAP__="__FAST_RESUME_BOOTSTRAP__"</script><script>${script}</script></body></html>`
 await writeFile('assets/editor.html',html)
 const client=await build({entryPoints:['src/client/index.tsx'],bundle:true,platform:'browser',format:'cjs',target:'es2022',write:false,minify:true,external:['react','react/jsx-runtime','react-dom','react-dom/client'],tsconfig:'tsconfig.browser.json'})
 await mkdir('lib/types/src/client',{recursive:true});await writeFile('lib/types/src/client/index.d.ts',await readFile('src/client/public.d.ts','utf8'))
 await writeFile('lib/client.js',`window.__ModuleLoader__.load({id:"dsh-fast-resume",factory:(require)=>{const module={exports:{}};const exports=module.exports;${client.outputFiles[0].text}\nreturn module.exports;}});\n`)
 console.log(`Built original editor srcdoc (${html.length} chars) and Harness client factory`)
}
if(process.argv[1]===new URL(import.meta.url).pathname)await buildBrowser()
