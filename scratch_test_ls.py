import psutil, urllib.request, ssl, json

pid = None
csrf = None
for p in psutil.process_iter(['pid', 'name', 'cmdline']):
    cmd = p.info['cmdline'] or []
    if 'language_server' in (p.info['name'] or '').lower() and '--app_data_dir' in cmd:
        pid = p.info['pid']
        for i, arg in enumerate(cmd):
            if arg == '--csrf_token' and i + 1 < len(cmd):
                csrf = cmd[i + 1]
        break

if pid and csrf:
    proc = psutil.Process(pid)
    ports = [c.laddr.port for c in proc.connections(kind='inet') if c.status == psutil.CONN_LISTEN]
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    methods = ['GetUser', 'GetStatus', 'GetMetadata', 'GetState']
    for port in ports:
        for m in methods:
            url = f'https://127.0.0.1:{port}/exa.language_server_pb.LanguageServerService/{m}'
            req = urllib.request.Request(url, data=b'{}', headers={'x-codeium-csrf-token': csrf, 'Content-Type': 'application/json'})
            try:
                with urllib.request.urlopen(req, context=ctx, timeout=1) as resp:
                    print(f'{m} on {port} -> status {resp.status}')
                    print(resp.read().decode('utf-8')[:300])
            except Exception as e:
                pass
