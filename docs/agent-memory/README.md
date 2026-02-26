# Chronicle Agent Memory Docs

Source docs converted from Word for agent bootstrapping.

## Preferred load order
1. `Chronicle_Product_Vision_v2.md` (or `.txt` for cleaner plain text)
2. `Chronicle_Technical_Architecture.md` (or `.txt` for cleaner plain text)

## Files
- `Chronicle_Product_Vision_v2.md`
- `Chronicle_Product_Vision_v2.txt`
- `Chronicle_Technical_Architecture.md`
- `Chronicle_Technical_Architecture.txt`

## Regenerate
```bash
pandoc "Chronicle_Product_Vision_v2.docx" -f docx -t gfm --wrap=none -o docs/agent-memory/Chronicle_Product_Vision_v2.md
pandoc "Chronicle_Technical_Architecture.docx" -f docx -t gfm --wrap=none -o docs/agent-memory/Chronicle_Technical_Architecture.md
pandoc "Chronicle_Product_Vision_v2.docx" -f docx -t plain --wrap=none -o docs/agent-memory/Chronicle_Product_Vision_v2.txt
pandoc "Chronicle_Technical_Architecture.docx" -f docx -t plain --wrap=none -o docs/agent-memory/Chronicle_Technical_Architecture.txt
```
