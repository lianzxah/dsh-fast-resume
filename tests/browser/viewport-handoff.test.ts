// @vitest-environment jsdom
import {expect,it} from 'vitest'
import {captureViewport,restoreViewport} from '../../upstream/editor/src/lib/viewport-handoff.ts'
it('captures DOM scroll and a useful manual anchor independently of placeholder store scroll',()=>{
 const container=document.createElement('div'),page=document.createElement('div')
 Object.defineProperties(container,{clientWidth:{value:400,configurable:true},clientHeight:{value:300}})
 container.scrollLeft=123;container.scrollTop=456
 container.getBoundingClientRect=()=>({left:10,top:20} as DOMRect);page.getBoundingClientRect=()=>({left:-90,top:-180} as DOMRect)
 const position=captureViewport(container,page,2)
 expect(position).toEqual({scrollX:123,scrollY:456,anchor:{x:150,y:175}})
 Object.defineProperty(container,'clientWidth',{value:200});page.getBoundingClientRect=()=>({left:-20,top:-100} as DOMRect)
 restoreViewport(container,page,2,position,true)
 expect(container.scrollLeft).toBe(293);expect(container.scrollTop).toBe(536)
 restoreViewport(container,page,1,position,false);expect(container.scrollLeft).toBe(0)
})
it('refuses hidden geometry instead of acknowledging a loaded viewport',()=>{const element=document.createElement('div');expect(()=>captureViewport(element,element,1)).toThrow('not visible');expect(()=>restoreViewport(element,element,1,{scrollX:0,scrollY:0},true)).toThrow('not visible')})
