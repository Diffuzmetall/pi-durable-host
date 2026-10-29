import {mkdir,realpath,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,relative,isAbsolute,dirname,basename,extname,join} from 'node:path';
import {randomUUID} from 'node:crypto';

function inside(root:string,path:string){const delta=relative(root,path);return delta!== '..'&&!delta.startsWith('../')&&!isAbsolute(delta);}

/** Save provider bytes under their actual format, exclusively and within the workspace. */
export async function saveGeneratedImages(cwd:string,requested:string|undefined,images: Array<{data:string;mimeType:string}>) {
 const root=await realpath(cwd);
 if(!images.length||images.length>5)throw Error('Invalid generated image count');
 const selected=resolve(root,requested??'.pi/generated-images');
 const hasExtension=!!extname(selected);
 const directory=hasExtension?dirname(selected):selected;
 if(!inside(root,directory))throw Error('Image output escapes workspace');
 let ancestor=directory;
 while(true){try{if(!inside(root,await realpath(ancestor)))throw Error('Image output resolves outside workspace');break;}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;const parent=dirname(ancestor);if(parent===ancestor)throw error;ancestor=parent;}}
 await mkdir(directory,{recursive:true,mode:0o700});
 const physicalDirectory=await realpath(directory);
 if(!inside(root,physicalDirectory))throw Error('Image output resolves outside workspace');
 const savedPaths:string[]=[];const normalized:Array<{data:string;mimeType:string}>=[];
 for(const [index,image]of images.entries()){
  if(!image.data.length||image.data.length>28_000_000||!/^[A-Za-z0-9+/]+={0,2}$/.test(image.data))throw Error('Invalid generated image encoding');
  const bytes=Buffer.from(image.data,'base64');
  if(bytes.length>20*1024*1024||bytes.toString('base64')!==image.data)throw Error('Invalid generated image size or encoding');
  let ext:string,mimeType:string;
  if(bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a'){ext='.png';mimeType='image/png';}
  else if(bytes.subarray(0,3).toString('hex')==='ffd8ff'){ext='.jpg';mimeType='image/jpeg';}
  else if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'){ext='.webp';mimeType='image/webp';}
  else throw Error('Unsupported generated image format');
  const stem=hasExtension?basename(selected,extname(selected)):`image-${randomUUID()}`;
  const name=`${stem}${images.length>1?`-${index+1}`:''}${ext}`;
  const path=join(physicalDirectory,name);
  const file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{await file.writeFile(bytes);}finally{await file.close();}
  savedPaths.push(path);normalized.push({data:image.data,mimeType});
 }
 return {savedPaths,images:normalized};
}
