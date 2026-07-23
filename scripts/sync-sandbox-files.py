"""Upload missing Sandbox connector files to NUC."""
import paramiko
import os

HOST = "192.168.40.60"
USER = "devops"
PASSWORD = "devops1234"
LOCAL = r"C:\Users\Intership004\zzh\MicroEra-Wiki-MVP\backend\connectors\sandbox"
REMOTE = "/data/code-project/microera-wiki/backend/connectors/sandbox"

def main():
    transport = paramiko.Transport((HOST, 22))
    transport.connect(username=USER, password=PASSWORD)
    sftp = paramiko.SFTPClient.from_transport(transport)

    # Upload individual files
    for f in ["db-sync.ts", "db-client.ts"]:
        local = os.path.join(LOCAL, f)
        remote = REMOTE + "/" + f
        if os.path.exists(local):
            sftp.put(local, remote)
            print(f"Uploaded {f}")

    # Upload knowledge directory
    klocal = os.path.join(LOCAL, "knowledge")
    kremote = REMOTE + "/knowledge"
    try:
        sftp.mkdir(kremote)
    except:
        pass

    for root, dirs, files in os.walk(klocal):
        for f in files:
            local_path = os.path.join(root, f)
            rel = os.path.relpath(local_path, klocal).replace("\\", "/")
            remote_path = kremote + "/" + rel
            remote_subdir = os.path.dirname(remote_path)
            try:
                sftp.stat(remote_subdir)
            except:
                parts = remote_subdir.split("/")
                for i in range(len(parts)):
                    partial = "/".join(parts[:i+1])
                    try:
                        sftp.mkdir(partial)
                    except:
                        pass
            sftp.put(local_path, remote_path)
            print(f"Uploaded knowledge/{rel}")

    sftp.close()
    transport.close()
    print("\nAll missing files uploaded!")

if __name__ == "__main__":
    main()
