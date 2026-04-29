'use strict';
const express    = require('express');
const http       = require('http');
const { WebSocketServer } = require('ws');
const { Client } = require('ssh2');
const path       = require('path');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server, path: '/ws' });

app.use(express.static(path.join(__dirname, 'public')));

wss.on('connection', (ws) => {
  let ssh          = null;
  let activeStream = null;

  const emit = (type, data) => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type, data }));
  };

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'deploy') {
      const { host, port, username, password, privateKey, script, sudoPassword } = msg;
      if (ssh) try { ssh.end(); } catch {}
      ssh = new Client();
      activeStream = null;

      emit('log', `\x1b[36m▸ Connecting to ${username}@${host}:${port || 22}...\x1b[0m\r\n`);

      ssh.on('ready', () => {
        emit('log', `\x1b[32m✓ SSH connected\x1b[0m\r\n`);
        emit('log', `\x1b[36m▸ Uploading script via SFTP...\x1b[0m\r\n`);

        ssh.sftp((err, sftp) => {
          if (err) { emit('error', `SFTP error: ${err.message}`); ssh.end(); return; }

          const remote = '/tmp/lp_provision.sh';
          const wr = sftp.createWriteStream(remote);

          wr.on('close', () => {
            emit('log', `\x1b[32m✓ Script uploaded → ${remote}\x1b[0m\r\n`);
            emit('log', `\x1b[36m▸ Executing provisioning script...\x1b[0m\r\n\r\n`);

            ssh.exec(
              `chmod +x ${remote} && bash ${remote}`,
              { pty: { term: 'xterm-color', cols: 120, rows: 40 } },
              (err, stream) => {
                if (err) { emit('error', err.message); ssh.end(); return; }

                activeStream = stream;

                stream.on('data', d => {
                  const text = d.toString();
                  emit('stdout', text);

                  if (/\[sudo\] password|\bpassword for\b/i.test(text)) {
                    if (sudoPassword) {
                      stream.write(sudoPassword + '\n');
                      emit('log', `\x1b[36m▸ sudo password sent automatically\x1b[0m\r\n`);
                    } else {
                      emit('sudoPrompt', null);
                    }
                  }
                });

                stream.stderr.on('data', d => emit('stderr', d.toString()));
                stream.on('close', code => {
                  activeStream = null;
                  emit('done', { code });
                  ssh.end();
                });
              }
            );
          });

          wr.end(script);
        });
      });

      ssh.on('error', err => emit('error', `\x1b[31m✗ ${err.message}\x1b[0m\r\n`));

      const opts = {
        host, port: +(port || 22), username,
        readyTimeout: 20000,
        ...(privateKey ? { privateKey } : { password }),
      };
      try { ssh.connect(opts); } catch (e) { emit('error', e.message); }
    }

    if (msg.type === 'import') {
      const { host, port, username, password, privateKey } = msg;
      if (ssh) try { ssh.end(); } catch {}
      ssh = new Client();
      activeStream = null;

      emit('log', `\x1b[36m▸ Connecting to ${username}@${host}:${port || 22}...\x1b[0m\r\n`);

      ssh.on('ready', () => {
        emit('log', `\x1b[32m✓ Connected\x1b[0m\r\n`);
        emit('log', `\x1b[36m▸ Scanning installed packages...\x1b[0m\r\n`);

        const script = [
          'HN=$(hostname -f 2>/dev/null || hostname); echo "_hostname=$HN"',
          'for p in docker git ncdu htop tmux curl vim nmap rsync unzip duf netdata nginx glances; do',
          '  if command -v $p &>/dev/null; then',
          '    echo "$p=1"',
          '  else',
          '    echo "$p=0"',
          '  fi',
          'done',
          'if command -v python3 &>/dev/null; then echo "python3=1"; else echo "python3=0"; fi',
          'if command -v node &>/dev/null; then echo "nodejs=1"; else echo "nodejs=0"; fi',
          'if command -v ufw &>/dev/null; then echo "ufw=1"; else echo "ufw=0"; fi',
          'if command -v fail2ban-client &>/dev/null; then echo "fail2ban=1"; else echo "fail2ban=0"; fi',
        ].join('\n');

        ssh.exec(script, (err, stream) => {
          if (err) { emit('error', err.message); ssh.end(); return; }
          let out = '';
          stream.on('data', d => {
            const t = d.toString();
            out += t;
            emit('log', t);
          });
          stream.stderr.on('data', d => emit('stderr', d.toString()));
          stream.on('close', () => {
            const detected = {};
            out.split('\n').forEach(line => {
              const eq = line.indexOf('=');
              if (eq === -1) return;
              const k = line.slice(0, eq).trim();
              const v = line.slice(eq + 1).trim();
              if (k === '_hostname') detected._hostname = v;
              else if (k) detected[k] = v === '1';
            });
            emit('log', '\r\n\x1b[32m✓ Scan complete\x1b[0m\r\n');
            emit('importResults', detected);
            ssh.end();
          });
        });
      });

      ssh.on('error', err => emit('error', `\x1b[31m✗ ${err.message}\x1b[0m\r\n`));

      const opts = {
        host, port: +(port || 22), username,
        readyTimeout: 20000,
        ...(privateKey ? { privateKey } : { password }),
      };
      try { ssh.connect(opts); } catch (e) { emit('error', e.message); }
    }

    if (msg.type === 'verify') {
      const { host, port, username, password, privateKey, checks } = msg;
      const vssh = new Client();
      const entries = Object.entries(checks);
      const script = entries.map(([k, cmd]) => `echo "__${k}__=$(${cmd} 2>/dev/null; true)"`).join('\n');
      vssh.on('ready', () => {
        vssh.exec(script, (err, stream) => {
          if (err) { emit('error', `Verify error: ${err.message}`); vssh.end(); return; }
          let out = '';
          stream.on('data', d => { out += d.toString(); });
          stream.stderr.on('data', () => {});
          stream.on('close', () => {
            const results = {};
            out.split('\n').forEach(line => {
              const m = line.match(/^__(\w+)__=(.*)/);
              if (m) results[m[1]] = m[2].trim();
            });
            emit('verifyResults', results);
            vssh.end();
          });
        });
      });
      vssh.on('error', err => emit('error', `\x1b[31m✗ Verify: ${err.message}\x1b[0m\r\n`));
      const opts = { host, port: +(port || 22), username, readyTimeout: 10000,
        ...(privateKey ? { privateKey } : { password }) };
      try { vssh.connect(opts); } catch (e) { emit('error', e.message); }
    }

    if (msg.type === 'input' && activeStream) {
      activeStream.write(msg.data);
    }

    if (msg.type === 'abort') {
      if (ssh) try { ssh.end(); } catch {}
      activeStream = null;
      emit('log', '\r\n\x1b[33m⚠ Aborted by user\x1b[0m\r\n');
    }
  });

  ws.on('close', () => {
    activeStream = null;
    if (ssh) try { ssh.end(); } catch {}
  });
});

const PORT = +(process.env.PORT || 8080);
server.listen(PORT, '0.0.0.0', () =>
  console.log(`LinuxProvisioner v2 → http://0.0.0.0:${PORT}`)
);
