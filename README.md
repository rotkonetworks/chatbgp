# ChatBGP

RFC 9003 BGP Shutdown Communication Encoder/Decoder

## Features

- Encode UTF-8 messages into BGP NOTIFICATION hex format
- Decode BGP hex dumps back to human-readable messages  
- Supports Administrative Shutdown (2) and Administrative Reset (4)
- WASM-based, runs entirely client-side

## Usage

```bash
git clone https://github.com/rotkonetworks/chatbgp
cd chatbgp
./scripts/setup.sh
npm run dev
```

## Commands

- `/nick <n>` - Set nickname
- `/as <number>` - Set AS number
- `/mode <2|4>` - Set subcode
- `/learn` - RFC 9003 explanation
- `/help` - Show commands

## Example

Encode:
```
> Maintenance in 30min
ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff ff 00 28 03 06 02 14 4d 61 69 6e 74 65 6e 61 6e 63 65 20 69 6e 20 33 30 6d 69 6e
```

Decode:
```
> [paste hex]
Type: Administrative Shutdown (2)
Message: "Maintenance in 30min"
```

## Build

```bash
cd wasm && wasm-pack build --target web
cd ../frontend && npm run build
```

## References

- [RFC 9003](https://www.rfc-editor.org/rfc/rfc9003.html)
- [RFC 4271](https://www.rfc-editor.org/rfc/rfc4271.html) (BGP-4)
