// @vitest-environment jsdom
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router-dom'
import {it,expect,vi} from 'vitest'
import {MenuBar} from '../../upstream/editor/src/components/layout/MenuBar.tsx'
import {StatusBar} from '../../upstream/editor/src/components/layout/StatusBar.tsx'
import {useEditorStore} from '../../upstream/editor/src/store/editor-store.ts'
vi.mock('@resume-editor/canvas-engine',()=>({alignBoxes:vi.fn(),distributeBoxes:vi.fn()}))
it('routes menu, status and shortcut to one callback, excluding IME and text editing',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const container=document.createElement('div');document.body.append(container);const root=createRoot(container),onAssistant=vi.fn(),before=useEditorStore.getState().ui.bottomPanelVisible
 try{await act(async()=>root.render(React.createElement(MemoryRouter,{future:{v7_startTransition:true,v7_relativeSplatPath:true}},React.createElement(MenuBar,{onAssistant,assistantLabel:'Assistant',labels:{save:'Save',versions:'Versions',showLeft:'Left',showRight:'Right'},onExport:()=>{},onImport:()=>{}}),React.createElement(StatusBar,{onAssistant,assistantLabel:'Assistant'}))))
 const click=(label:string)=>{const button=[...container.querySelectorAll('button')].find(node=>node.textContent?.trim()===label);if(!button)throw Error(label);button.click()}
 await act(async()=>click('视图'));await act(async()=>click('AssistantCtrl+J'));await act(async()=>click('Assistant'))
 await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'j',ctrlKey:true})));expect(onAssistant).toHaveBeenCalledTimes(3)
 await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'j',metaKey:true,isComposing:true})))
 const field=document.createElement('textarea');container.append(field);field.focus();await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'j',ctrlKey:true})));expect(onAssistant).toHaveBeenCalledTimes(3);expect(useEditorStore.getState().ui.bottomPanelVisible).toBe(before)
 }finally{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals()}
})
