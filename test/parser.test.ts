import { describe, it, expect } from 'vitest';
import { Parser } from '../src/parser/parser';

describe('Parser', () => {
  const parser = new Parser('test.rpy');

  it('parses label definitions', () => {
    const result = parser.parse('label start:\n    "Hello world"');
    expect(result.labels.size).toBe(1);
    expect(result.labels.has('start')).toBe(true);
    const label = result.labels.get('start')!;
    expect(label.name).toBe('start');
    expect(label.line).toBe(0);
  });

  it('parses label with parameters', () => {
    const result = parser.parse('label greet(name, greeting="hello"):\n    "[greeting], [name]!"');
    const label = result.labels.get('greet')!;
    expect(label.name).toBe('greet');
    expect(label.parameters).toBe('name, greeting="hello"');
  });

  it('parses character definitions', () => {
    const result = parser.parse('define e = Character("Eileen", color="#c8ffc8")');
    expect(result.characters.size).toBe(1);
    expect(result.characters.has('e')).toBe(true);
    expect(result.defines.get('e')!.value).toContain('Character');
  });

  it('parses screen definitions', () => {
    const result = parser.parse('screen say(who, what):\n    text what');
    expect(result.screens.size).toBe(1);
    expect(result.screens.has('say')).toBe(true);
    expect(result.screens.get('say')!.parameters).toBe('who, what');
  });

  it('parses jump and call commands', () => {
    const result = parser.parse('label start:\n    jump ending\n    call subroutine');
    const children = result.labels.get('start')!.children;
    expect(children.length).toBe(2);

    const jumpNode = children[0];
    expect(jumpNode.type).toBe('command');
    if (jumpNode.type === 'command') {
      expect(jumpNode.command).toBe('jump');
      expect(jumpNode.target).toBe('ending');
    }

    const callNode = children[1];
    expect(callNode.type).toBe('command');
    if (callNode.type === 'command') {
      expect(callNode.command).toBe('call');
      expect(callNode.target).toBe('subroutine');
    }
  });

  it('parses dialogue lines', () => {
    const result = parser.parse('label start:\n    e "Hello there!"');
    const children = result.labels.get('start')!.children;
    const dialogue = children[0];
    expect(dialogue.type).toBe('dialogue');
    if (dialogue.type === 'dialogue') {
      expect(dialogue.character).toBe('e');
      expect(dialogue.text).toBe('Hello there!');
    }
  });

  it('parses narration lines', () => {
    const result = parser.parse('label start:\n    "Once upon a time..."');
    const children = result.labels.get('start')!.children;
    const narration = children[0];
    expect(narration.type).toBe('narration');
    if (narration.type === 'narration') {
      expect(narration.text).toBe('Once upon a time...');
    }
  });

  it('parses menu with choices', () => {
    const result = parser.parse(
      'label start:\n' +
      '    menu:\n' +
      '        "Choice A":\n' +
      '            jump a\n' +
      '        "Choice B":\n' +
      '            jump b\n'
    );
    const children = result.labels.get('start')!.children;
    const menu = children[0];
    expect(menu.type).toBe('menu');
    expect(menu.children.length).toBeGreaterThanOrEqual(2);
  });

  it('parses define and default variables', () => {
    const result = parser.parse(
      'define config.name = "My Game"\n' +
      'default points = 0\n'
    );
    expect(result.defines.has('config.name')).toBe(true);
    expect(result.defaults.has('points')).toBe(true);
    expect(result.defaults.get('points')!.value).toBe('0');
  });

  it('parses image definitions', () => {
    const result = parser.parse('image bg room = "bg/room.png"');
    expect(result.images.has('bg room')).toBe(true);
    expect(result.images.get('bg room')!.value).toBe('"bg/room.png"');
  });

  it('parses transform definitions', () => {
    const result = parser.parse('transform myslide(d=1.0):\n    ease d xalign 1.0');
    expect(result.transforms.has('myslide')).toBe(true);
    expect(result.transforms.get('myslide')!.parameters).toBe('d=1.0');
  });

  it('parses init blocks', () => {
    const result = parser.parse(
      'init -1 python:\n' +
      '    config.name = "Test"\n'
    );
    const nodes = result.nodes.filter(n => n.type !== 'blank');
    expect(nodes[0].type).toBe('init_block');
    if (nodes[0].type === 'init_block') {
      expect(nodes[0].priority).toBe(-1);
      expect(nodes[0].isPython).toBe(true);
    }
  });

  it('parses python lines', () => {
    const result = parser.parse('label start:\n    $ score = 0');
    const children = result.labels.get('start')!.children;
    expect(children[0].type).toBe('python_line');
    if (children[0].type === 'python_line') {
      expect(children[0].expression).toBe('score = 0');
    }
  });

  it('parses show/scene/hide commands', () => {
    const result = parser.parse(
      'label start:\n' +
      '    scene bg room\n' +
      '    show eileen happy at right\n' +
      '    hide eileen\n'
    );
    const children = result.labels.get('start')!.children;
    expect(children[0].type).toBe('command');
    if (children[0].type === 'command') {
      expect(children[0].command).toBe('scene');
      expect(children[0].target).toBe('bg room');
    }
    if (children[1].type === 'command') {
      expect(children[1].command).toBe('show');
      expect(children[1].target).toBe('eileen happy');
    }
    if (children[2].type === 'command') {
      expect(children[2].command).toBe('hide');
      expect(children[2].target).toBe('eileen');
    }
  });

  it('parses style definitions', () => {
    const result = parser.parse('style my_button is button:\n    background "#f00"');
    const nodes = result.nodes.filter(n => n.type !== 'blank');
    expect(nodes[0].type).toBe('style_def');
    if (nodes[0].type === 'style_def') {
      expect(nodes[0].name).toBe('my_button');
      expect(nodes[0].parent).toBe('button');
    }
  });

  it('parses testcase definitions', () => {
    const result = parser.parse('testcase good_end:\n    "Go to the library"');
    expect(result.testcases.has('good_end')).toBe(true);
  });

  it('parses translate blocks', () => {
    const result = parser.parse('translate japanese start_abc12345:\n    e "こんにちは！"');
    const nodes = result.nodes.filter(n => n.type !== 'blank');
    expect(nodes[0].type).toBe('translate');
    if (nodes[0].type === 'translate') {
      expect(nodes[0].language).toBe('japanese');
      expect(nodes[0].identifier).toBe('start_abc12345');
    }
  });

  it('reports mixed indentation', () => {
    const result = parser.parse('label start:\n\t    "mixed"');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('Mixed indentation');
  });

  it('handles comments', () => {
    const result = parser.parse('# This is a comment\nlabel start:\n    # Another comment\n    "text"');
    const comments = result.nodes.filter(n => n.type === 'comment');
    expect(comments.length).toBeGreaterThanOrEqual(1);
  });

  it('handles blank lines', () => {
    const result = parser.parse('label start:\n    "Hello"\n\n    "World"');
    expect(result.labels.get('start')!.children.length).toBeGreaterThanOrEqual(2);
  });

  it('parses a complete game script', () => {
    const script = `
define e = Character("Eileen", color="#c8ffc8")
define s = Character("Sylvie", color="#c8c8ff")

default points = 0

image bg room = "bg/room.png"

label start:
    scene bg room
    show eileen happy at center
    with dissolve

    e "Welcome to our game!"
    s "Let's have fun!"

    menu:
        "Say hello":
            $ points += 1
            e "Hello!"
            jump good_path
        "Stay silent":
            e "..."
            jump bad_path

label good_path:
    e "Thanks for being friendly!"
    return

label bad_path:
    e "That was rude."
    return
`;
    const result = parser.parse(script.trim());

    expect(result.labels.size).toBe(3);
    expect(result.characters.size).toBe(2);
    expect(result.defines.size).toBe(2);
    expect(result.defaults.size).toBe(1);
    expect(result.images.size).toBe(1);
    expect(result.errors.length).toBe(0);
  });
});
