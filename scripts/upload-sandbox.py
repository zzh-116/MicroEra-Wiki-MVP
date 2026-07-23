"""Upload Sandbox files to NUC via SFTP."""
import paramiko
import os
import sys

HOST = "192.168.40.60"
USER = "devops"
PASSWORD = "devops1234"
LOCAL_DIR = r"C:\Users\Intership004\zzh\sandbox"
REMOTE_DIR = "/data/archive-hot/sandbox"

def connect_sftp():
    transport = paramiko.Transport((HOST, 22))
    transport.connect(username=USER, password=PASSWORD)
    return paramiko.SFTPClient.from_transport(transport), transport

def mkdir_p(sftp, remote_dir):
    """Create remote directory recursively."""
    parts = remote_dir.split('/')
    for i in range(1, len(parts)):
        partial = '/'.join(parts[:i+1])
        try:
            sftp.stat(partial)
        except:
            sftp.mkdir(partial)

def upload_file(sftp, local_path, remote_path):
    size_mb = os.path.getsize(local_path) / (1024 * 1024)
    print(f"  {os.path.basename(local_path)} ({size_mb:.1f} MB) ... ", end="", flush=True)
    sftp.put(local_path, remote_path)
    print("OK")

def main():
    sftp, transport = connect_sftp()

    # Create remote dir
    mkdir_p(sftp, REMOTE_DIR)
    mkdir_p(sftp, f"{REMOTE_DIR}/dist")
    mkdir_p(sftp, f"{REMOTE_DIR}/config")

    # Upload large files
    big_files = ["miqrosandbox.jar", "miqroproject.sql", "server.js"]
    for f in big_files:
        local_path = os.path.join(LOCAL_DIR, f)
        remote_path = f"{REMOTE_DIR}/{f}"
        if os.path.exists(local_path):
            upload_file(sftp, local_path, remote_path)
        else:
            print(f"  {f} - NOT FOUND, skipping")

    # Upload dist directory
    dist_local = os.path.join(LOCAL_DIR, "dist")
    if os.path.exists(dist_local):
        for root, dirs, files in os.walk(dist_local):
            for f in files:
                local_path = os.path.join(root, f)
                rel_path = os.path.relpath(local_path, dist_local).replace("\\", "/")
                remote_path = f"{REMOTE_DIR}/dist/{rel_path}"
                remote_subdir = os.path.dirname(remote_path)
                mkdir_p(sftp, remote_subdir)
                print(f"  dist/{rel_path} ... ", end="", flush=True)
                sftp.put(local_path, remote_path)
                print("OK")

    sftp.close()
    transport.close()
    print("\nAll files uploaded!")

if __name__ == "__main__":
    main()
