# 07: Peer-to-peer sync over the venue Wi-Fi (WebRTC)

**Parent:** werewolf-v2 (../werewolf-v2.md) — stories ww-bjq1

**What to build:** Devices of one contest open WebRTC data channels signalled through the Durable Object while online. When the internet drops, commands flow between devices directly; a device relays them to the Durable Object once reachable. Transport is pluggable behind the sync protocol.

**Blocked by:** 06

**Status:** done

- [x] Two browsers on one network: cut the uplink, desk verdict reaches the announcer within a second
- [x] No duplicate or reordered commands after the internet returns
- [x] Works with the internet coming back while peers are still connected

## Verified

- Real browsers (Chrome, two separate profiles, one local Worker): a desk and an announcer view opened on one contest and each showed one peer within a second. I then killed the Worker. A weight declared at the desk reached the announcer in 46–61 ms over the data channel. I restarted the Worker; both devices converged to the same 3 commands, the desk had no pending changes, and the server log held 3 unique command IDs (no duplicate, no reorder). The Worker was killed while both pages stayed open, so this covers "internet returns while peers are still connected". The script was a throwaway outside the repository; ticket 17 repeats this on real devices.
- Workerd test (ww-bjq1): the actor announces presence, forwards a signal to one named device with a role it stamps itself, rejects commands from read-only screens, and two editors that relay the same peer-heard command produce one log entry. Replica test: a command heard twice or through two routes counts once.
- Limit: devices must have met while online, because signalling uses the actor. The venue Wi-Fi must allow device-to-device traffic (no client isolation); I did not test mDNS host-candidate hiding on phones. Ticket 17 checks this.
- `bun run gate:full` passes.
