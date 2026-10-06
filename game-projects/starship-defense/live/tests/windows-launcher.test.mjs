import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

test('Windows PowerShell 5.1可以解析中文启动脚本，源码保持UTF8 BOM和CRLF', {skip:process.platform!=='win32'},()=>{
  for(const name of ['start-live.ps1','tts.ps1']){
    const file=path.resolve(import.meta.dirname,'..',name),bytes=readFileSync(file);
    assert.deepEqual([...bytes.subarray(0,3)],[239,187,191]);
    assert(!/(?<!\r)\n/.test(bytes.toString('utf8')),'PowerShell scripts use CRLF');
    const script='$t=$null; $e=$null; [System.Management.Automation.Language.Parser]::ParseFile($args[0],[ref]$t,[ref]$e) | Out-Null; if($e.Count){ $e | ForEach-Object {$_.ErrorId}; exit 1 }; $PSVersionTable.PSVersion.Major';
    // A file path passed via an environment variable avoids -Command argument
    // parsing differences between Windows PowerShell and newer PowerShell.
    const command=script.replace('$args[0]','$env:CHONGCHAO_PARSE_FILE');
    const result=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{env:{...process.env,CHONGCHAO_PARSE_FILE:file},encoding:'utf8',windowsHide:true});
    assert.equal(result.trim(),'5');
  }
});
