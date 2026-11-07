/** Conversation placement changes only this iframe's panel visibility, never persisted source history. */
import {useEditorStore} from '../../upstream/editor/src/store/editor-store.ts'
/** Collapse internal panels while retaining tool, tabs, dimensions and the checkpoint's original preferences.
 * Each opaque iframe has its own store; the retained checkpoint remains unchanged for global recovery.
 */
export function applyConversationPlacement():void{
 const state=useEditorStore.getState()
 useEditorStore.setState({ui:{...state.ui,leftPanelVisible:false,rightPanelVisible:false,bottomPanelVisible:false}})
}
