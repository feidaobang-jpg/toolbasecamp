// Local review only. Run node work/serve_review.cjs; supports video seeking and subtitle tracks.
const fs=require('fs'),path=require('path'),http=require('http');
const root=path.resolve(process.env.REVIEW_ROOT||path.join(__dirname,'..'));
const types={'.html':'text/html; charset=utf-8','.mp4':'video/mp4','.vtt':'text/vtt; charset=utf-8','.jpg':'image/jpeg','.txt':'text/plain; charset=utf-8','.srt':'text/plain; charset=utf-8'};
http.createServer((req,res)=>{
 let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end();}
 if(pathname==='/'){res.writeHead(302,{Location:'/work/review/index.html'});return res.end();}
 const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
 fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){res.writeHead(404);return res.end();}
  let start=0,end=stat.size-1,status=200;
  if(req.headers.range){const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!match){res.writeHead(416);return res.end();}
   start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;status=206;
   if(start>end){res.writeHead(416);return res.end();}res.setHeader('Content-Range',`bytes ${start}-${end}/${stat.size}`);}
  res.writeHead(status,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'no-store'});
  fs.createReadStream(file,{start,end}).pipe(res);
 });
}).listen(Number(process.env.REVIEW_PORT||0),'127.0.0.1',function(){console.log('REVIEW http://127.0.0.1:'+this.address().port+'/work/review/index.html');});
