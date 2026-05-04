# SAP NetWeaver 7.50 SP02 on KVM

This guide documents a repeatable way to run `SAP NetWeaver AS ABAP 7.50 SP02 Developer Edition` on a KVM VM and expose it for ARC-1 testing.

It is based on:
- SAP's `7.50 SP02` developer-edition installation guidance
- SAP's official getting-started guide for the `NPL` appliance family
- a working KVM installation used for ARC-1 validation

This guide intentionally skips the dead ends and only keeps the steps that mattered in the final working setup.

## When To Use This

Use this approach if:
- you want a stable `7.50` system for ARC-1 testing
- you already have a Linux server with KVM
- you want clearer isolation than a direct host install
- you do not want to build and maintain an unofficial Docker image around the old installer

Do not use this guide if:
- you only need a modern trial ABAP system and can use the newer Docker-packaged trial instead
- you need a supported production deployment

## Recommended Shape

SAP Community's concise guide for `7.50 SP02` calls out a static hostname, working hostname resolution, `csh`, `libaio`, `uuidd`, English locale, swap, and enough free disk space. In practice, a VM this size is comfortable:

- `4 vCPU`
- `16 GB RAM`
- `8 GB swap`
- `120-150 GB` disk
- `x86_64` Linux guest

Official/community minimums are lower, but they are tight for a modern VM and for running ARC-1 against the system.

## High-Level Layout

The simplest reusable layout is:

- Linux host with KVM and `qemu-system-x86_64`
- one Ubuntu guest dedicated to `NPL`
- host-forwarded ports for guest SSH, SAP GUI, HTTP, and HTTPS
- optional `nginx` reverse proxy on the host for ADT/browser access

This guide uses:

- guest hostname `vhcalnplci`
- SAP SID `NPL`
- guest IP `<guest-ip>`
- host ports `7522`, `7520`, `7530`, `7500`, `7543`

You can change the public port numbers, but do not change the SAP-internal SID or instance numbers.

## Step 1. Download The SAP Media

You need all of these from SAP:

1. `SAP NetWeaver AS ABAP 7.50 SP02 Developer Edition` archive parts
2. the separate ASE test-drive license package

Put the license file in the same extracted directory as `install.sh` and name it exactly:

```text
SYBASE_ASE_TD.lic
```

That matches SAP Community guidance for the separate ASE license package.

## Step 2. Prepare The KVM Host

Install the host-side tools:

```bash
sudo apt update
sudo apt install -y qemu-kvm qemu-system-x86 qemu-utils cloud-image-utils genisoimage bridge-utils
```

Create a working directory:

```bash
sudo mkdir -p /data/vm/npl750/{images,seed,media,logs,run}
```

Copy the SAP media into:

```bash
/data/vm/npl750/media
```

## Step 3. Create The Guest Disk And Cloud-Init Seed

Download a guest image. Ubuntu cloud images work well for a headless KVM guest:

```bash
cd /data/vm/npl750/images
sudo wget https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img -O ubuntu-22.04-server-cloudimg-amd64.img
sudo qemu-img create -f qcow2 -b ubuntu-22.04-server-cloudimg-amd64.img npl750.qcow2 150G
```

Create `user-data`:

```yaml
#cloud-config
hostname: vhcalnplci
manage_etc_hosts: true
package_update: true
packages:
  - csh
  - tcsh
  - libaio1
  - uuid-runtime
  - net-tools
  - iputils-ping
  - unzip
  - curl
  - wget
  - rsync
  - qemu-guest-agent
  - p7zip-full
  - genisoimage
  - locales
  - expect
runcmd:
  - locale-gen en_US.UTF-8
  - update-locale LANG=en_US.UTF-8
  - fallocate -l 8G /swapfile
  - chmod 600 /swapfile
  - mkswap /swapfile
  - swapon /swapfile
  - sh -c 'echo "/swapfile none swap sw 0 0" >> /etc/fstab'
  - sysctl -w vm.max_map_count=1000000
  - sh -c 'echo "vm.max_map_count=1000000" > /etc/sysctl.d/99-npl750.conf'
```

Create `meta-data`:

```yaml
instance-id: npl750
local-hostname: vhcalnplci
```

Generate the seed ISO:

```bash
sudo cloud-localds /data/vm/npl750/seed/seed.iso user-data meta-data
```

## Step 4. Start The VM

This QEMU command is the working pattern used for ARC-1:

```bash
qemu-system-x86_64 \
  -name npl750 \
  -enable-kvm \
  -machine q35,accel=kvm \
  -cpu host \
  -smp 4 \
  -m 16384 \
  -drive if=virtio,file=/data/vm/npl750/images/npl750.qcow2,format=qcow2 \
  -drive if=virtio,file=/data/vm/npl750/seed/seed.iso,format=raw,media=cdrom,readonly=on \
  -virtfs local,path=/data/vm/npl750/media,mount_tag=hostmedia,security_model=none,readonly=on \
  -nic user,model=virtio-net-pci,hostfwd=tcp::7522-:22,hostfwd=tcp::7500-:8000,hostfwd=tcp::7543-:44300,hostfwd=tcp::7520-:3200,hostfwd=tcp::7530-:3300 \
  -display none \
  -serial file:/data/vm/npl750/logs/console.log \
  -daemonize \
  -pidfile /data/vm/npl750/run/qemu.pid
```

That gives you:

- host `7522 -> guest 22`
- host `7500 -> guest 8000`
- host `7543 -> guest 44300`
- host `7520 -> guest 3200`
- host `7530 -> guest 3300`

If you want the VM to survive reboots more cleanly, wrap the start and stop commands in a small `systemd` unit.

## Step 5. Prepare The Guest

Connect to the guest:

```bash
ssh -p 7522 root@<host-ip-or-fqdn>
```

Then verify the SAP-critical OS assumptions before installing:

```bash
hostname
hostname -f
locale
systemctl status uuidd --no-pager
free -h
swapon --show
df -h
```

What must be true:

- hostname is stable and pingable
- hostname is not longer than `13` characters
- locale is `en_US.UTF-8`
- `uuidd` is available
- swap exists
- you have enough free disk space on `/`, `/usr/sap`, `/sapmnt`, and `/sybase`

Important best practice from SAP Community:
- the hostname used during installation must keep resolving after reboots
- do not let it resolve to `127.0.1.1`
- use a static mapping or stable DHCP reservation

## Step 6. Mount And Extract The SAP Media

Mount the host media share:

```bash
mkdir -p /mnt/hostmedia
mount -t 9p -o trans=virtio,version=9p2000.L hostmedia /mnt/hostmedia
```

Extract the split archives into a working directory:

```bash
mkdir -p /root/sapmedia
cd /root/sapmedia
7z x /mnt/hostmedia/sap_nw_as_abap_750_sp02_ase_dev_ed_p1.rar
```

After extraction, confirm:

- the extracted directory contains `install.sh`
- `SYBASE_ASE_TD.lic` is present next to `install.sh`

## Step 7. Run The Installer

From the extracted top-level directory:

```bash
cd /root/sapmedia/<extracted-directory>
sudo ./install.sh -s -k
```

Why these flags:

- `-s` skips the fragile legacy hostname check
- `-k` skips the installer's own kernel tuning

Use a simple master password that satisfies the installer. In this KVM setup, a short password worked more reliably than a long one. If the installer fails around `askSidAdm`, retry with a password no longer than `14` characters.

Expected result:

- the installer creates `/usr/sap/NPL`, `/sapmnt/NPL`, and `/sybase/NPL`
- ASCS and D00 are installed
- the database is initialized

## Step 8. Validate The First Boot

Check the main listeners inside the guest:

```bash
ss -ltnp | egrep '(:3200|:3300|:8000|:44300|:4901)'
```

Healthy end state:

- `3200` SAP GUI dispatcher
- `3300` gateway
- `8000` HTTP
- `44300` HTTPS
- `4901` ASE

Check ADT from the host:

```bash
curl -sku DEVELOPER:Appl1ance https://127.0.0.1:7543/sap/bc/adt/discovery
```

If the credentials are still initial, `DEVELOPER` and `DDIC` on client `001` should work. SAP's official getting-started guide also documents that the `DEVELOPER` user may ask for this user key the first time you create an object:

```text
35408798513176413512
```

## Step 9. Apply The Two Fixes That Matter Most On Modern Guests

These were the two critical post-install fixes on Ubuntu/KVM.

### Fix 1. Make Sure The Hostname Does Not Resolve To Loopback

If `vhcalnplci` resolves to `127.0.1.1`, D00 can fail with a loopback-hostname error.

Set the hostname mapping to the real guest IP in:

```bash
/etc/hosts
/etc/cloud/templates/hosts.debian.tmpl
```

Use a line like:

```text
<guest-ip> vhcalnplci.localdomain vhcalnplci
```

Then verify:

```bash
getent hosts vhcalnplci
```

### Fix 2. Make Sure ASE Listens On The Real Guest IP

If ASE binds only to loopback, ABAP work processes cannot connect to the database.

Check:

```bash
ss -ltnp | grep 4901
```

If ASE is only on `127.0.1.1:4901`, update:

```bash
/sybase/NPL/interfaces
```

The `NPL`, `NPL_BS`, and `NPL_JSAGENT` entries must point to the real guest IP, for example `<guest-ip>`. Use a real editor and real tab-separated formatting. Do not write escaped `\t` strings into the file.

Restart ASE after the edit and verify it now listens on the guest IP.

## Step 10. Known ASE Crash During Install On Modern Linux

On this KVM install, ASE crashed during the installer's DB password-reset phase unless `dataserver` was wrapped with a smaller stack limit and trace flag `-T11889`.

If the installer fails around `syb_step_reset_db_passwords` or ASE crashes in `Snap::Validate()`, replace:

```bash
/sybase/NPL/ASE-16_0/bin/dataserver
```

with a wrapper like this and keep the original as `dataserver.real`:

```bash
#!/bin/bash
set -e
. /sybase/NPL/SYBASE.sh
ulimit -s 2048

args=("$@")
have_flag=0
for arg in "${args[@]}"; do
  if [ "$arg" = "-T11889" ]; then
    have_flag=1
    break
  fi
done

if [ "$have_flag" -eq 0 ]; then
  exec /sybase/NPL/ASE-16_0/bin/dataserver.real -T11889 "$@"
fi

exec /sybase/NPL/ASE-16_0/bin/dataserver.real "$@"
```

This is not part of the official SAP guide. It is a practical recovery for running the old installer on a modern Ubuntu guest.

## Step 11. Starting And Stopping The System

Normal SAP lifecycle inside the guest should be:

```bash
su - npladm
sapcontrol -nr 00 -function GetProcessList
startsap r3
stopsap r3
```

If ASCS is up but D00 stays down, check:

- hostname resolution
- ASE listener on `4901`
- `dev_disp`, `stderr0`, and `dev_w*` in `/usr/sap/NPL/D00/work`

If you must recover D00 manually, this command worked on the ARC-1 VM:

```bash
sudo -u npladm /bin/bash -lc 'cd /usr/sap/NPL/D00/work && export DIR_LIBRARY=/usr/sap/NPL/D00/exe && export LD_LIBRARY_PATH=/usr/sap/NPL/D00/exe:/usr/sap/NPL/hdbclient:/usr/sap/NPL/SYS/global/syb/linuxx86_64/sybodbc:/sybase/NPL/ASE-16_0/lib:/sybase/NPL/OCS-16_0/lib:/sybase/NPL/OCS-16_0/lib3p64:/sybase/NPL/OCS-16_0/lib3p:/usr/sap/NPL/SYS/exe/run:/usr/sap/NPL/SYS/exe/uc/linuxx86_64 && nohup ./dw.sapNPL_D00 pf=/usr/sap/NPL/SYS/profile/NPL_D00_vhcalnplci >/tmp/d00-stdout.log 2>/tmp/d00-stderr.log < /dev/null &'
```

Treat that as a recovery step, not the preferred day-2 operating model.

## Step 12. Expose The System Cleanly

For browser and ADT access, a host-side reverse proxy is convenient. Example `nginx` site:

```nginx
server {
    server_name <host-fqdn>;

    location / {
        proxy_pass https://127.0.0.1:7543;
        proxy_ssl_verify off;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
        proxy_pass_header sap-usercontext;
        proxy_pass_header SAP_SESSIONID;
        proxy_cookie_path / /;
    }

    listen 443 ssl;
}
```

For SAP GUI, do not use the reverse proxy. Expose the forwarded SAP GUI port directly through the host firewall.

Example `ufw` rules:

```bash
ufw allow 7522/tcp comment 'NPL guest SSH'
ufw allow 7520/tcp comment 'NPL SAP GUI'
ufw allow 7530/tcp comment 'NPL gateway'
```

Best-practice note:
- SAP's official CAL guidance recommends minimizing public exposure and preferring SSH, VPN, or a private network for admin access.
- For a public lab system, restrict source IP ranges where possible.

## Step 13. Connect With SAP GUI And ADT

If you use host-forwarded SAP GUI instead of bridged guest networking, SAP GUI for `NPL` should use the public forwarded port, not the SAP-internal `3200`.

Example SAP GUI expert-mode string:

```text
conn=/H/<host-fqdn>/S/7520&system=NPL
```

ADT:

```bash
curl -sku DEVELOPER:Appl1ance https://<host-fqdn>/sap/bc/adt/discovery
```

ARC-1 probe:

```bash
TEST_SAP_URL=https://<host-fqdn> \
TEST_SAP_USER=DEVELOPER \
TEST_SAP_PASSWORD=Appl1ance \
TEST_SAP_CLIENT=001 \
TEST_SAP_LANGUAGE=EN \
TEST_SAP_INSECURE=false \
npm run probe -- --save-fixtures tests/fixtures/probe/<your-system-name>
```

## Troubleshooting Checklist

If installation or startup fails, check these in order:

1. `hostname` and `hostname -f` are stable and not loopback-mapped.
2. `LANG=en_US.UTF-8`.
3. `csh`, `libaio`, `uuidd`, and swap are present.
4. `SYBASE_ASE_TD.lic` is next to `install.sh`.
5. ASE listens on the real guest IP, not `127.0.1.1`.
6. D00 work-process logs do not show database-connect or loopback-hostname errors.
7. If ASE dies during install, apply the `dataserver` wrapper workaround and rerun the installer.
8. If you exposed SAP GUI through a forwarded host port, connect to that forwarded port, not to a different SAP system already listening on `3200`.

## References

- [SAP Community: SAP NW AS ABAP 7.50 SP2 Developer Edition concise installation guide](https://community.sap.com/t5/application-development-blog-posts/sap-nw-as-abap-7-50-sp2-developer-edition-to-download-concise-installation/bc-p/13294679)
- [SAP Community: AS ABAP 7.5x ASE license available](https://community.sap.com/t5/application-development-and-automation-blog-posts/as-abap-7-5x-ase-license-available/bc-p/13360434/highlight/true)
- [SAP Community: Newbies Guide installing ABAP AS 751 SP02 on Linux](https://community.sap.com/t5/application-development-and-automation-blog-posts/newbies-guide-installing-abap-as-751-sp02-on-linux/ba-p/13343634)
- [SAP official getting-started guide for the NPL appliance family](https://assets.cdn.sap.com/sapcom/docs/2016/07/468b612a-807c-0010-82c7-eda71af511fa.pdf)
