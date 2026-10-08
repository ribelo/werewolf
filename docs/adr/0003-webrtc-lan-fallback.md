# Devices keep syncing peer-to-peer over the venue Wi-Fi when the internet drops

Devices of one contest open WebRTC data channels to each other, signalled through the contest's Durable Object while the internet works; when the uplink drops (often for about a minute on the venue's 5G) the channels keep working over the shared Wi-Fi and devices exchange commands directly, relaying them to the Durable Object once it is reachable. A local server was rejected because the organizers run no LAN infrastructure; a LAN-only start without any internet contact is out of scope.
