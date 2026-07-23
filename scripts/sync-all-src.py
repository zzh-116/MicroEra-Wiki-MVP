"""Sync all source files from local to NUC — only .ts and .json files."""
import paramiko
import os

HOST = "192.168.40.60"
USER = "devops"
PASSWORD = "devops1234"
LOCAL_ROOT = r"C:\Users\Intership004\zzh\MicroEra-Wiki-MVP"
REMOTE_ROOT = "/data/code-project/microera-wiki"

DIRS_TO_SYNC = ["backend", "server", "src"]

def main():
    transport = paramiko.Transport((HOST, 22))
    transport.connect(username=USER, password=PASSWORD)
    sftp = paramiko.SFTPClient.from_transport(transport)

    total = 0
    for dir_name in DIRS_TO_SYNC:
        local_dir = os.path.join(LOCAL_ROOT, dir_name)
        remote_dir = f"{REMOTE_ROOT}/{dir_name}"

        for root, dirs, files in os.walk(local_dir):
            # Skip node_modules and .git
            dirs[:] = [d for d in dirs if d not in ('node_modules', '.git', 'tmp', 'dist')]

            for f in files:
                if not (f.endswith('.ts') or f.endswith('.tsx') or f.endswith('.json')):
                    continue
                local_path = os.path.join(root, f)
                rel = os.path.relpath(local_path, local_dir).replace("\\", "/")
                remote_path = f"{remote_dir}/{rel}"
                remote_subdir = os.path.dirname(remote_path)

                # Create remote directory
                try:
                    sftp.stat(remote_subdir)
                except:
                    parts = remote_subdir.split("/")
                    for i in range(len(parts)):
                        try:
                            sftp.mkdir("/".join(parts[:i+1]))
                        except:
                            pass

                sftp.put(local_path, remote_path)
                total += 1
                if total % 20 == 0:
                    print(f"  ... {total} files synced")

    sftp.close()
    transport.close()
    print(f"\nSynced {total} source files to NUC!")

if __name__ == "__main__":
    main()
