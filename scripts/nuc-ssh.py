"""NUC SSH helper — runs commands on the NUC server via password auth."""
import sys
import paramiko

HOST = "192.168.40.60"
USER = "devops"
PASSWORD = "devops1234"

def run(cmd: str, timeout: int = 60) -> tuple[int, str, str]:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, password=PASSWORD, timeout=10)
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    client.close()
    return exit_code, out, err

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python nuc-ssh.py <command>")
        sys.exit(1)
    cmd = sys.argv[1]
    code, out, err = run(cmd)
    # Write binary-safe to avoid UnicodeEncodeError on Windows (gbk console)
    sys.stdout.buffer.write(out.encode('utf-8', errors='replace') + b'\n')
    sys.stdout.buffer.flush()
    if err:
        msg = b'[STDERR] ' + err.encode('utf-8', errors='replace') + b'\n'
        sys.stderr.buffer.write(msg)
        sys.stderr.buffer.flush()
    sys.exit(code)
