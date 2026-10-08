# 07: Peer-to-peer sync over the venue Wi-Fi (WebRTC)

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-bjq1

**What to build:** Devices of one contest open WebRTC data channels signalled through the Durable Object while online. When the internet drops, commands flow between devices directly; a device relays them to the Durable Object once reachable. Transport is pluggable behind the sync protocol.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] Two browsers on one network: cut the uplink, desk verdict reaches the announcer within a second
- [ ] No duplicate or reordered commands after the internet returns
- [ ] Works with the internet coming back while peers are still connected
