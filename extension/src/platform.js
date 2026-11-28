// Only the bundled Android WebView installs this bridge. Transfer bounded chunks
// to an app-private spool before handing the complete file to the document picker.
let pending
globalThis.marginSaveResult=(ok,message)=>{
  if(!pending)return
  const done=pending;pending=null
  if(ok || message==='Canceled') done.resolve()
  else done.reject(Error(message || 'Export failed.'))
}
export async function androidSave(blob,name) {
  if(pending)throw Error('Finish the current export first.')
  const native=globalThis.MarginAndroid
  if(!native.beginSave(name,blob.type,blob.size)) throw Error('Could not prepare the export.')
  try {
    for(let off=0;off<blob.size;off+=32768) {
      const bytes=new Uint8Array(await blob.slice(off,off+32768).arrayBuffer())
      if(!native.appendSave(btoa(String.fromCharCode(...bytes)))) throw Error('Could not write the export.')
    }
    return await new Promise((resolve,reject)=>{pending={resolve,reject};native.chooseDestination()})
  } catch(e) {pending=null;native.cancelSave();throw e}
}
