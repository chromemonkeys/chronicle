/**
 * Slash commands extension: "/" at line start opens a block type insertion menu.
 * Implemented as a simple suggestion/autocomplete triggered by "/" character.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

type SlashCommand = {
  label: string;
  description: string;
  action: (view: EditorView) => void;
};

const slashCommandsKey = new PluginKey("slashCommands");

function createMenu(commands: SlashCommand[], view: EditorView, pos: number): HTMLElement {
  const menu = document.createElement("div");
  menu.className = "cm-slash-menu";
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", "Block type menu");

  let selectedIndex = 0;

  function renderItems() {
    menu.innerHTML = "";
    commands.forEach((cmd, i) => {
      const item = document.createElement("button");
      item.className = `cm-slash-item ${i === selectedIndex ? "active" : ""}`;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(i === selectedIndex));
      item.type = "button";

      const label = document.createElement("span");
      label.className = "cm-slash-label";
      label.textContent = cmd.label;

      const desc = document.createElement("span");
      desc.className = "cm-slash-desc";
      desc.textContent = cmd.description;

      item.appendChild(label);
      item.appendChild(desc);

      item.addEventListener("mousedown", (e) => {
        e.preventDefault();
        executeCommand(i);
      });

      menu.appendChild(item);
    });
  }

  function executeCommand(index: number) {
    const cmd = commands[index];
    // Delete the "/" character first
    const tr = view.state.tr.delete(pos, pos + 1);
    view.dispatch(tr);
    cmd.action(view);
    closeMenu();
  }

  function closeMenu() {
    menu.remove();
    view.dom.removeEventListener("keydown", handleKeydown);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % commands.length;
      renderItems();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + commands.length) % commands.length;
      renderItems();
    } else if (e.key === "Enter") {
      e.preventDefault();
      executeCommand(selectedIndex);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeMenu();
    } else {
      // Any other key closes the menu
      closeMenu();
    }
  }

  view.dom.addEventListener("keydown", handleKeydown);
  renderItems();

  // Position the menu
  const coords = view.coordsAtPos(pos);
  menu.style.position = "fixed";
  menu.style.left = `${coords.left}px`;
  menu.style.top = `${coords.bottom + 4}px`;
  menu.style.maxHeight = "min(360px, calc(100vh - 16px))";
  menu.style.overflowY = "auto";

  // Keep menu visible within viewport bounds.
  requestAnimationFrame(() => {
    const rect = menu.getBoundingClientRect();
    const viewportPadding = 8;
    if (rect.right > window.innerWidth - viewportPadding) {
      const clampedLeft = Math.max(viewportPadding, window.innerWidth - rect.width - viewportPadding);
      menu.style.left = `${clampedLeft}px`;
    }
    if (rect.bottom > window.innerHeight - viewportPadding) {
      const aboveTop = coords.top - rect.height - 4;
      menu.style.top = `${Math.max(viewportPadding, aboveTop)}px`;
    }
  });

  return menu;
}

export const SlashCommands = Extension.create({
  name: "slashCommands",

  addProseMirrorPlugins() {
    const commands: SlashCommand[] = [
      {
        label: "Heading 1",
        description: "Large section heading",
        action: (view) => {
          const { state, dispatch } = view;
          const { $from } = state.selection;
          const nodeType = state.schema.nodes.heading;
          dispatch(state.tr.setBlockType($from.pos, $from.pos, nodeType, { level: 1 }));
        },
      },
      {
        label: "Heading 2",
        description: "Medium section heading",
        action: (view) => {
          const { state, dispatch } = view;
          const { $from } = state.selection;
          const nodeType = state.schema.nodes.heading;
          dispatch(state.tr.setBlockType($from.pos, $from.pos, nodeType, { level: 2 }));
        },
      },
      {
        label: "Heading 3",
        description: "Small section heading",
        action: (view) => {
          const { state, dispatch } = view;
          const { $from } = state.selection;
          const nodeType = state.schema.nodes.heading;
          dispatch(state.tr.setBlockType($from.pos, $from.pos, nodeType, { level: 3 }));
        },
      },
      {
        label: "Bullet List",
        description: "Unordered list",
        action: (view) => {
          const { state, dispatch } = view;
          const { bulletList, listItem } = state.schema.nodes;
          const { $from } = state.selection;
          const paragraph = state.schema.nodes.paragraph.create();
          const item = listItem.create(null, paragraph);
          const list = bulletList.create(null, item);
          dispatch(state.tr.replaceWith($from.before(), $from.after(), list));
        },
      },
      {
        label: "Ordered List",
        description: "Numbered list",
        action: (view) => {
          const { state, dispatch } = view;
          const { orderedList, listItem } = state.schema.nodes;
          const { $from } = state.selection;
          const paragraph = state.schema.nodes.paragraph.create();
          const item = listItem.create(null, paragraph);
          const list = orderedList.create(null, item);
          dispatch(state.tr.replaceWith($from.before(), $from.after(), list));
        },
      },
      {
        label: "Code Block",
        description: "Fenced code block",
        action: (view) => {
          const { state, dispatch } = view;
          const { $from } = state.selection;
          const nodeType = state.schema.nodes.codeBlock;
          dispatch(state.tr.setBlockType($from.pos, $from.pos, nodeType));
        },
      },
      {
        label: "Blockquote",
        description: "Quoted text block",
        action: (view) => {
          const { state, dispatch } = view;
          const { blockquote } = state.schema.nodes;
          const { $from } = state.selection;
          const paragraph = state.schema.nodes.paragraph.create();
          const quote = blockquote.create(null, paragraph);
          dispatch(state.tr.replaceWith($from.before(), $from.after(), quote));
        },
      },
    ];

    return [
      new Plugin({
        key: slashCommandsKey,
        props: {
          handleTextInput(view, from, _to, text) {
            if (text !== "/") return false;

            // Only trigger at the start of an empty paragraph
            const { $from } = view.state.selection;
            const node = $from.parent;
            if (node.type.name !== "paragraph" || node.textContent.length > 0) {
              return false;
            }

            // Defer to after the "/" is inserted
            setTimeout(() => {
              const menu = createMenu(commands, view, from);
              document.body.appendChild(menu);
            }, 0);

            return false;
          },
        },
      }),
    ];
  },
});
