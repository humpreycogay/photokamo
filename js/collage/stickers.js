// Collage stickers: original vector artwork drawn in code, plus emoji drawn from the vendored Twemoji SVGs
// (vendor/twemoji, CC-BY 4.0; loaded from this site only), with the system emoji font as the fallback.
// Each sticker draws itself in a w × h unit box; drawStickers() renders it at the sheet's resolution with a white
// die-cut outline (a dilated silhouette) and a soft shadow, so preview and export match at any size.

const TAU = Math.PI * 2;
const STICKER_FONT = '800 40px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/** A star (n points, outer R, inner r) as a Path2D. */
function star(cx, cy, R, r, n = 5, turn = -Math.PI / 2) {
  const path = new Path2D();
  for (let i = 0; i < n * 2; i++) { const a = turn + i * Math.PI / n, d = i % 2 ? r : R; path[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * d, cy + Math.sin(a) * d); }
  path.closePath(); return path;
}
const HEART = 'M50 88 C20 66 6 50 6 32 C6 18 17 8 30 8 C39 8 46 13 50 21 C54 13 61 8 70 8 C83 8 94 18 94 32 C94 50 80 66 50 88 Z';
function heart(ctx, x, y, s, color) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s / 100, s / 100);
  ctx.fillStyle = color; ctx.fill(new Path2D(HEART));
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(22, 28); ctx.quadraticCurveTo(24, 18, 34, 17); ctx.stroke();
  ctx.restore();
}
const paint = (ctx, path, fill, stroke = null, width = 3) => {
  ctx.fillStyle = fill; ctx.fill(path);
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(path); }
};
const circle = (x, y, r) => { const p = new Path2D(); p.arc(x, y, r, 0, TAU); return p; };
/** Centred text that fits `maxW` units, at most `size` units tall. */
function label(ctx, text, x, y, maxW, size, color, font = STICKER_FONT) {
  ctx.font = font.replace('40px', `${size}px`); const w = ctx.measureText(text).width;
  if (w > maxW) ctx.font = font.replace('40px', `${size * maxW / w}px`);
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y);
}
/** A washi tape strip with torn (zigzag) ends and a pattern. */
function tape(color, pattern) {
  return ctx => {
    const path = new Path2D(); path.moveTo(4, 0);
    for (let x = 4; x <= 96; x += 4) path.lineTo(x, 0);
    for (let y = 0; y <= 28; y += 4) path.lineTo(y % 8 ? 100 : 96, y);
    for (let x = 96; x >= 4; x -= 4) path.lineTo(x, 28);
    for (let y = 28; y >= 0; y -= 4) path.lineTo(y % 8 ? 0 : 4, y);
    path.closePath(); ctx.fillStyle = color; ctx.fill(path); ctx.save(); ctx.clip(path); pattern(ctx); ctx.restore();
  };
}
/** A rounded word badge. */
function badge(text, fill, ink = '#ffffff', shape = 'pill') {
  return ctx => {
    const path = new Path2D();
    if (shape === 'banner') { path.moveTo(0, 6); path.lineTo(100, 6); path.lineTo(92, 20); path.lineTo(100, 34); path.lineTo(0, 34); path.lineTo(8, 20); path.closePath(); }
    else path.roundRect(2, 3, 96, 34, 17);
    paint(ctx, path, fill); label(ctx, text, 50, 21, shape === 'banner' ? 72 : 80, 22, ink);
  };
}
function emoji(char) {
  return ctx => {
    ctx.font = `80px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText(char), up = m.actualBoundingBoxAscent || 70, down = m.actualBoundingBoxDescent || 10;
    ctx.fillText(char, 50, 50 + (up - down) / 2);
  };
}

/** A pointed leaf `len` long along +x from (0, 0): filled, with a paler middle vein. */
function leaf(ctx, x, y, len, angle, fill, vein = 'rgba(255,255,255,.35)', wide = .32) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  const path = new Path2D(`M0 0 C${len * .3} ${-len * wide} ${len * .75} ${-len * wide * .9} ${len} 0 C${len * .75} ${len * wide * .9} ${len * .3} ${len * wide} 0 0 Z`);
  ctx.fillStyle = fill; ctx.fill(path); ctx.strokeStyle = vein; ctx.lineWidth = Math.max(.6, len * .04); ctx.beginPath(); ctx.moveTo(len * .08, 0); ctx.lineTo(len * .85, 0); ctx.stroke();
  ctx.restore();
}
/** The same leaf as an outline only (line art). */
function leafLine(ctx, x, y, len, angle, wide = .3) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ctx.stroke(new Path2D(`M0 0 C${len * .3} ${-len * wide} ${len * .75} ${-len * wide * .9} ${len} 0 C${len * .75} ${len * wide * .9} ${len * .3} ${len * wide} 0 0 Z M${len * .1} 0 L${len * .7} 0`));
  ctx.restore();
}
/** Points along a cubic stem (p0..p3), `n` of them from t0 to t1, each { x, y, a } with a = the stem's direction. */
function along([x0, y0, x1, y1, x2, y2, x3, y3], n, t0 = .12, t1 = .96) {
  return Array.from({ length: n }, (_, i) => {
    const t = t0 + (t1 - t0) * i / Math.max(1, n - 1), u = 1 - t;
    const x = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3, y = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
    const dx = 3 * u * u * (x1 - x0) + 6 * u * t * (x2 - x1) + 3 * t * t * (x3 - x2), dy = 3 * u * u * (y1 - y0) + 6 * u * t * (y2 - y1) + 3 * t * t * (y3 - y2);
    return { x, y, a: Math.atan2(dy, dx) };
  });
}
const stemPath = ([x0, y0, x1, y1, x2, y2, x3, y3]) => new Path2D(`M${x0} ${y0} C${x1} ${y1} ${x2} ${y2} ${x3} ${y3}`);
/** Dried flower heads: tiny five-petal florets at the tips of thin branching stems from (base). */
function driedSpray(ctx, base, tips, stem, petal, centre, r) {
  ctx.strokeStyle = stem; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
  for (const [x, y, bend = 0] of tips) { ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.quadraticCurveTo((base[0] + x) / 2 + bend, (base[1] + y) / 2, x, y); ctx.stroke(); }
  for (const [x, y] of tips) for (let k = 0; k < 5; k++) {
    const a = k * TAU / 5 + x, fx = x + Math.cos(a) * r * 1.4, fy = y + Math.sin(a) * r * 1.4;
    ctx.strokeStyle = stem; ctx.lineWidth = .6; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(fx, fy); ctx.stroke();
    for (let q = 0; q < 5; q++) { ctx.fillStyle = petal; ctx.fill(circle(fx + Math.cos(q * TAU / 5) * r * .55, fy + Math.sin(q * TAU / 5) * r * .55, r * .5)); }
    ctx.fillStyle = centre; ctx.fill(circle(fx, fy, r * .32));
  }
}

/** @typedef {{ id: string, name: string, group: string, tags: string, w: number, h: number, outline: boolean, flat?: boolean, emoji?: string, draw: (ctx: CanvasRenderingContext2D) => void }} StickerDef
 *  tags: extra search words. flat: drawn without a shadow (line art and ink, which sit in the paper). */
const def = (group, id, name, draw, { w = 100, h = 100, outline = true, flat = false, tags = '' } = {}) => ({ id, name, group, tags, w, h, outline, ...(flat ? { flat } : {}), draw });

/** Sticker groups, in the order the picker shows them. */
export const STICKER_GROUPS = [['faces', 'Faces'], ['love', 'Love'], ['words', 'Words'], ['doodles', 'Doodles'], ['hands', 'Hands'], ['animals', 'Animals'],
  ['food', 'Food & drink'], ['nature', 'Nature & weather'], ['party', 'Party & wins'], ['travel', 'Travel'], ['fun', 'School & fun'], ['scrapbook', 'Scrapbook'], ['vintage', 'Pressed & vintage']];

// Emoji stickers: "char name|extra tags", grouped. Names are what search and screen readers use. Each draws its
// Twemoji SVG (vector, crisp at any size) once loaded, else the system emoji font.
const EMOJI = {
  faces: '😀 grinning|happy smile;😃 big smile|happy;😄 smiling eyes|happy;😁 beaming|grin;😆 laughing|lol;😅 sweat smile|phew;😂 tears of joy|lol laugh crying;🤣 rolling on the floor|lol laugh rofl;🥲 happy tear;😊 blushing smile|happy;😇 angel|halo innocent;🙂 slight smile;🙃 upside down|silly;😉 wink;😌 relieved|calm;😍 heart eyes|love crush;🥰 smiling with hearts|love;😘 blowing a kiss|love;😗 kissing;😚 kissing closed eyes;😋 yummy|tongue tasty;😛 tongue out;😝 squinting tongue|silly;😜 winking tongue|crazy silly;🤪 zany|crazy silly;🤨 raised eyebrow|sus;🧐 monocle|curious;🤓 nerd|glasses smart;😎 cool sunglasses;🥸 disguise;🤩 star struck|wow amazing;🥳 party face|birthday celebrate;😏 smirk;😒 unamused;😞 disappointed|sad;😔 pensive|sad;😟 worried;🙁 frowning|sad;😣 persevering;😖 confounded;😫 tired;😩 weary;🥺 pleading|puppy eyes please;😢 crying|sad tear;😭 sobbing|cry sad;😤 huffing|frustrated;😠 angry;😡 furious|mad angry;🤬 swearing|angry;🤯 mind blown|shocked;😳 flushed|embarrassed;🥵 hot|heat;🥶 freezing|cold;😱 screaming|scared shock;😨 fearful|scared;😰 anxious;😥 sad but relieved;😓 downcast sweat;🤗 hugging|hug;🤔 thinking|hmm;🫣 peeking|shy;🤭 giggling|oops;🫢 gasp|surprised;🤫 shushing|quiet secret;🤥 lying;😶 speechless;😐 neutral;😑 expressionless;😬 grimacing|awkward;🙄 eye roll;😯 hushed;😮 open mouth|wow surprised;😲 astonished|shocked;🥱 yawning|tired bored;😴 sleeping|zzz tired;🤤 drooling;😪 sleepy;😵 dizzy;🤐 zipper mouth|secret;🥴 woozy;🤢 nauseated|sick;🤮 vomiting|sick gross;🤧 sneezing|sick;😷 face mask|sick;🤒 thermometer|sick ill;🤑 money mouth|rich;🤠 cowboy;😈 smiling devil|naughty;👿 angry devil;👻 ghost|boo halloween;💀 skull|dead lol;☠️ skull and crossbones|pirate;👽 alien|ufo;👾 space invader|game;🤖 robot;💩 poop|funny;🤡 clown;👹 ogre|monster;😺 smiling cat;😸 grinning cat;😹 cat with tears of joy|lol;😻 cat heart eyes|love;🙀 shocked cat;🙈 see no evil monkey|oops shy;🙉 hear no evil monkey;🙊 speak no evil monkey|secret',
  love: '❤️ red heart|love;🧡 orange heart;💛 yellow heart;💚 green heart;💙 blue heart;💜 purple heart;🖤 black heart;🤍 white heart;🤎 brown heart;💔 broken heart|sad breakup;❤️‍🔥 heart on fire;❣️ heart exclamation;💕 two hearts|love;💞 revolving hearts;💓 beating heart;💗 growing heart;💖 sparkling heart;💘 heart with arrow|cupid valentine;💝 heart with ribbon|gift valentine;💟 heart decoration;💌 love letter|valentine;💋 kiss mark|lips;💍 ring|engaged wedding;💐 bouquet|flowers;🌹 rose|flower valentine;🫶 heart hands|love;🥂 cheers|toast wedding;💑 couple|love;💏 kiss couple;🫂 people hugging|hug friends',
  hands: '👍 thumbs up|like yes good;👎 thumbs down|no dislike;👌 ok hand|perfect;✌️ peace|victory;🤞 fingers crossed|luck;🤟 love you hand;🤘 rock on|metal;🤙 call me|shaka;👋 waving hand|hello hi bye;👏 clapping|applause bravo;🙌 raised hands|celebrate yay;👐 open hands;🤲 palms up;🙏 folded hands|please thanks pray;🤝 handshake|deal;💪 flexed biceps|strong muscle;✍️ writing hand;👀 eyes|look;👆 pointing up;👇 pointing down;👉 pointing right;👈 pointing left;☝️ index pointing up;✋ raised hand|high five;🖐️ hand with fingers splayed;🫰 finger heart|love;🫵 pointing at you;💅 nail polish|sassy;👊 fist bump;✊ raised fist',
  animals: '🐶 dog|puppy pet;🐱 cat|kitten pet;🐭 mouse;🐹 hamster|pet;🐰 bunny|rabbit easter;🦊 fox;🐻 bear;🐼 panda;🐨 koala;🐯 tiger;🦁 lion;🐮 cow;🐷 pig;🐸 frog;🐵 monkey;🐔 chicken;🐧 penguin;🐦 bird;🐤 baby chick;🦄 unicorn|magic;🐝 bee;🦋 butterfly;🐞 ladybug;🐢 turtle;🐍 snake;🦖 dinosaur|t-rex dino;🐙 octopus;🐬 dolphin;🐳 whale;🐠 tropical fish;🦈 shark;🦀 crab;🐘 elephant;🦒 giraffe;🦓 zebra;🐴 horse;🦔 hedgehog;🦥 sloth|lazy;🦦 otter;🐾 paw prints|pet',
  food: '🍕 pizza;🍔 burger|hamburger;🍟 fries;🌭 hot dog;🌮 taco;🍣 sushi;🍜 noodles|ramen;🍝 spaghetti|pasta;🍿 popcorn|movie;🍩 donut|doughnut;🍪 cookie;🎂 birthday cake|party;🧁 cupcake;🍰 cake slice;🍫 chocolate;🍬 candy|sweets;🍭 lollipop|candy;🍦 soft serve|ice cream;🍨 ice cream;🍓 strawberry;🍉 watermelon|summer;🍌 banana;🍎 apple;🍒 cherries;🍑 peach;🥑 avocado;🍇 grapes;🍍 pineapple;🥐 croissant;🥞 pancakes|breakfast;🧇 waffle;🍳 fried egg|breakfast;☕ coffee|cafe;🧋 bubble tea|boba;🥤 soda|drink;🧃 juice box;🍹 tropical drink|cocktail summer;🍵 tea|matcha;🥛 milk;🍯 honey',
  nature: '🌈 rainbow;☀️ sun|sunny summer;🌤️ sun behind cloud;⛅ partly cloudy;☁️ cloud;🌧️ rain;⛈️ storm|thunder;❄️ snowflake|winter;⛄ snowman|winter;🌙 crescent moon|night;🌕 full moon;⭐ star;🌟 glowing star;✨ sparkles|magic shine;💫 dizzy star;☄️ comet;🌍 earth|world globe;🔥 fire|lit hot;💧 droplet|water;🌊 wave|ocean sea beach;🌸 cherry blossom|flower spring;🌺 hibiscus|flower;🌻 sunflower|flower;🌷 tulip|flower spring;🌼 blossom|flower;🍀 four leaf clover|luck;🌿 herb|leaf plant;🍁 maple leaf|autumn fall;🍂 fallen leaves|autumn fall;🌵 cactus;🌴 palm tree|beach summer;🌲 pine tree|forest;🍄 mushroom;🌱 seedling|sprout plant;🪐 ringed planet|space;⚡ lightning|zap;🌪️ tornado;🌅 sunrise|sunset;🏔️ snowy mountain',
  party: '🎉 party popper|tada celebrate;🎊 confetti ball|celebrate;🎈 balloon|birthday party;🎁 gift|present birthday;🎀 ribbon|bow;🪅 piñata|party;🎆 fireworks|new year;🎇 sparkler;🧨 firecracker;🎄 christmas tree|holiday;🎃 jack-o-lantern|halloween pumpkin;🕯️ candle;🎓 graduation cap|graduate school;🏆 trophy|winner champion;🥇 gold medal|first winner;🥈 silver medal;🥉 bronze medal;🎖️ military medal;👑 crown|king queen princess;💎 gem|diamond;💯 hundred points|perfect;✅ check mark|done yes;🆒 cool button;🆕 new button;🔝 top arrow;💥 boom|collision;💢 anger symbol;💤 zzz|sleep;💬 speech balloon|chat;💭 thought balloon;🔔 bell',
  travel: '✈️ airplane|flight trip vacation;🚗 car|road trip;🚌 bus;🚂 train;🚀 rocket|space;🛸 flying saucer|ufo;🚲 bicycle|bike;🛵 scooter;⛵ sailboat;🚢 ship|cruise;🏖️ beach|vacation summer;🏝️ desert island|vacation;🏕️ camping;⛺ tent|camping;🎡 ferris wheel|fair;🎢 roller coaster|theme park;🎠 carousel;🏰 castle|princess;🗼 tower|tokyo;🗽 statue of liberty|new york;🗺️ world map;🧭 compass;🧳 luggage|suitcase travel;📍 round pushpin|location;🏠 house|home;🌃 night city;🎒 backpack|school;📷 camera|photo;📸 camera with flash|selfie photo;🕶️ sunglasses|summer cool',
  fun: '📚 books|school study;📖 open book|read;✏️ pencil|school;🖍️ crayon|art;🎨 artist palette|art paint;✂️ scissors|craft;📝 memo|notes;📌 pushpin;📎 paperclip;🧸 teddy bear|toy;🪀 yo-yo|toy;🪁 kite;🎮 video game|controller gamer;🕹️ joystick|game;🎲 dice|game;🧩 puzzle piece|game;♟️ chess pawn|game;🎯 bullseye|target;🎵 musical note|music;🎶 musical notes|music song;🎧 headphones|music;🎤 microphone|sing karaoke;🎸 guitar|music;🎹 piano|music;🥁 drum|music;🎬 clapper board|movie film;📱 mobile phone;💻 laptop;🔬 microscope|science;🔭 telescope|space;⚽ soccer ball|football sport;🏀 basketball|sport;🏈 american football|sport;⚾ baseball|sport;🎾 tennis|sport;🏐 volleyball|sport;🏓 ping pong|sport;🛹 skateboard;🏊 swimming|sport;🚴 cycling|bike sport;🤸 cartwheel|gymnastics;🩰 ballet shoes|dance;🏄 surfing|beach;⛸️ ice skate|winter'
};
const codepoints = char => [...char].map(c => c.codePointAt(0).toString(16)).filter(cp => cp !== 'fe0f').join('-');
/** Twemoji's file name: code points in hex; U+FE0F is dropped unless the sequence has a zero-width joiner. */
const twemojiName = char => { const cps = [...char].map(c => c.codePointAt(0).toString(16)); return (cps.includes('200d') ? cps : cps.filter(cp => cp !== 'fe0f')).join('-'); };
const TWEMOJI_DIR = new URL('../../vendor/twemoji/svg/', import.meta.url).href;
const emojiStickers = Object.entries(EMOJI).flatMap(([group, list]) => list.split(';').map(entry => {
  const space = entry.indexOf(' '), char = entry.slice(0, space), [name, tags = ''] = entry.slice(space + 1).split('|');
  return { ...def(group, `emoji-${codepoints(char)}`, name[0].toUpperCase() + name.slice(1), emoji(char), { tags: `${tags} emoji` }), emoji: char, file: `${TWEMOJI_DIR}${twemojiName(char)}.svg` };
}));

/** @type {StickerDef[]} */
export const stickers = [
  // Doodles
  def('doodles', 'heart', 'Heart', ctx => heart(ctx, 0, 2, 100, '#ec4863'), { tags: 'love valentine' }),
  def('doodles', 'hearts', 'Two hearts', ctx => { heart(ctx, 2, 30, 62, '#ff7aa2'); heart(ctx, 38, 4, 60, '#ec4863'); }),
  def('doodles', 'star', 'Star', ctx => paint(ctx, star(50, 54, 47, 21), '#ffc93c', '#f0a500', 4)),
  def('doodles', 'sparkles', 'Sparkles', ctx => {
    const sparkle = (x, y, r) => { const p = new Path2D(); p.moveTo(x, y - r); p.quadraticCurveTo(x + r * .14, y - r * .14, x + r, y); p.quadraticCurveTo(x + r * .14, y + r * .14, x, y + r); p.quadraticCurveTo(x - r * .14, y + r * .14, x - r, y); p.quadraticCurveTo(x - r * .14, y - r * .14, x, y - r); p.closePath(); return p; };
    paint(ctx, sparkle(40, 58, 38), '#ffd84d', '#f2b705'); paint(ctx, sparkle(80, 20, 17), '#ffe58a', '#f2b705'); paint(ctx, sparkle(82, 76, 10), '#ffe58a', '#f2b705', 2);
  }),
  def('doodles', 'sun', 'Sun', ctx => {
    ctx.fillStyle = '#ffb703';
    for (let i = 0; i < 12; i++) { const a = i * TAU / 12; ctx.beginPath(); ctx.moveTo(50 + Math.cos(a - .14) * 32, 50 + Math.sin(a - .14) * 32); ctx.lineTo(50 + Math.cos(a) * 49, 50 + Math.sin(a) * 49); ctx.lineTo(50 + Math.cos(a + .14) * 32, 50 + Math.sin(a + .14) * 32); ctx.fill(); }
    paint(ctx, circle(50, 50, 30), '#ffd166', '#f4a300');
    ctx.fillStyle = '#7a4b00'; ctx.fill(circle(40, 46, 3.5)); ctx.fill(circle(60, 46, 3.5));
    ctx.strokeStyle = '#7a4b00'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(50, 52, 11, .25 * Math.PI, .75 * Math.PI); ctx.stroke();
  }),
  def('doodles', 'rainbow', 'Rainbow', ctx => {
    ctx.lineWidth = 9; ctx.lineCap = 'butt';
    [['#ef476f', 42], ['#ffd166', 33], ['#06d6a0', 24], ['#118ab2', 15]].forEach(([color, r]) => { ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(50, 52, r, Math.PI, TAU); ctx.stroke(); });
    ctx.fillStyle = '#ffffff'; for (const [x, y, r] of [[8, 52, 9], [18, 50, 10], [28, 54, 7], [72, 54, 7], [82, 50, 10], [92, 52, 9]]) ctx.fill(circle(x, y, r));
  }, { h: 62 }),
  def('doodles', 'cloud', 'Cloud', ctx => paint(ctx, new Path2D('M25 75 A15 15 0 0 1 22 46 A20 20 0 0 1 56 30 A18 18 0 0 1 84 50 A13 13 0 0 1 78 75 Z'), '#ffffff', '#8fb8de', 3.5), { h: 90 }),
  def('doodles', 'flower', 'Flower', ctx => {
    ctx.fillStyle = '#ff8fab'; ctx.strokeStyle = '#e5607f'; ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) { ctx.save(); ctx.translate(50, 50); ctx.rotate(i * TAU / 8); ctx.beginPath(); ctx.ellipse(0, -26, 12, 22, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore(); }
    paint(ctx, circle(50, 50, 15), '#ffc93c', '#e8a600', 2.5);
  }),
  def('doodles', 'daisy', 'Daisy', ctx => {
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#d6d6d6'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 12; i++) { ctx.save(); ctx.translate(50, 50); ctx.rotate(i * TAU / 12); ctx.beginPath(); ctx.ellipse(0, -28, 8, 20, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore(); }
    paint(ctx, circle(50, 50, 13), '#ffbe0b', '#e09f00', 2);
  }),
  def('doodles', 'smiley', 'Smiley', ctx => {
    paint(ctx, circle(50, 50, 46), '#ffd23f', '#e8a600', 3);
    ctx.fillStyle = '#3d2c1e'; ctx.beginPath(); ctx.ellipse(36, 40, 5, 8, 0, 0, TAU); ctx.ellipse(64, 40, 5, 8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,110,140,.45)'; ctx.fill(circle(26, 58, 7)); ctx.fill(circle(74, 58, 7));
    ctx.strokeStyle = '#3d2c1e'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(50, 52, 20, .2 * Math.PI, .8 * Math.PI); ctx.stroke();
  }),
  def('doodles', 'crown', 'Crown', ctx => {
    paint(ctx, new Path2D('M10 78 L14 28 L33 50 L50 16 L67 50 L86 28 L90 78 Z'), '#ffc93c', '#d99a00', 3.5);
    paint(ctx, new Path2D('M10 70 H90 V84 H10 Z'), '#f4a300', '#d99a00', 3);
    for (const [x, y, c] of [[14, 26, '#ef476f'], [50, 14, '#118ab2'], [86, 26, '#06d6a0']]) paint(ctx, circle(x, y, 6), c);
  }),
  def('doodles', 'bolt', 'Lightning', ctx => paint(ctx, new Path2D('M60 4 L18 56 H46 L36 96 L82 40 H54 Z'), '#ffd23f', '#e09f00', 3.5)),
  def('doodles', 'notes', 'Music notes', ctx => {
    ctx.fillStyle = '#5a4fcf';
    ctx.beginPath(); ctx.ellipse(28, 78, 13, 9, -.4, 0, TAU); ctx.ellipse(74, 68, 13, 9, -.4, 0, TAU); ctx.fill();
    ctx.fillRect(36, 22, 6, 56); ctx.fillRect(82, 12, 6, 56); ctx.fill(new Path2D('M36 22 L88 10 L88 24 L36 36 Z'));
  }),
  def('doodles', 'leaf', 'Leaf', ctx => {
    paint(ctx, new Path2D('M12 88 C12 40 44 12 90 10 C88 56 60 88 12 88 Z'), '#52b788', '#2d6a4f', 3);
    ctx.strokeStyle = '#2d6a4f'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(12, 88); ctx.bezierCurveTo(40, 62, 60, 40, 84, 16); ctx.stroke();
  }),
  def('doodles', 'cherry', 'Cherries', ctx => {
    ctx.strokeStyle = '#3a7d44'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(30, 64); ctx.quadraticCurveTo(40, 30, 62, 10); ctx.moveTo(70, 70); ctx.quadraticCurveTo(66, 36, 62, 10); ctx.stroke();
    paint(ctx, new Path2D('M62 10 C74 4 88 10 90 20 C78 24 68 20 62 10 Z'), '#52b788');
    paint(ctx, circle(28, 72, 20), '#d62839'); paint(ctx, circle(70, 76, 20), '#e63946');
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill(circle(21, 66, 5)); ctx.fill(circle(63, 70, 5));
  }),
  def('doodles', 'moon', 'Moon', ctx => { paint(ctx, new Path2D('M60 6 A44 44 0 1 0 94 64 A36 36 0 1 1 60 6 Z'), '#ffd166', '#e0a21b', 3); paint(ctx, star(78, 22, 9, 4), '#ffe58a'); }, { tags: 'night sleep' }),
  def('doodles', 'balloon', 'Balloon', ctx => {
    ctx.strokeStyle = '#6c757d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(50, 80); ctx.bezierCurveTo(42, 88, 58, 92, 48, 100); ctx.stroke();
    ctx.fillStyle = '#ef476f'; ctx.beginPath(); ctx.ellipse(50, 40, 30, 37, 0, 0, TAU); ctx.fill(); ctx.fill(new Path2D('M44 82 L56 82 L50 74 Z'));
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(38, 26, 6, 11, .5, 0, TAU); ctx.fill();
  }, { tags: 'party birthday' }),
  def('doodles', 'gift', 'Gift', ctx => {
    ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(38, 24, 12, 8, .5, 0, TAU); ctx.ellipse(62, 24, 12, 8, -.5, 0, TAU); ctx.stroke();
    paint(ctx, new Path2D('M14 46 H86 V94 H14 Z'), '#118ab2'); paint(ctx, new Path2D('M8 32 H92 V48 H8 Z'), '#1a9fd0');
    ctx.fillStyle = '#ffd166'; ctx.fillRect(44, 32, 12, 62);
  }, { tags: 'present birthday party' }),
  def('doodles', 'paw', 'Paw print', ctx => {
    ctx.fillStyle = '#8d6346'; ctx.beginPath(); ctx.ellipse(50, 66, 24, 20, 0, 0, TAU); ctx.fill();
    for (const [x, y, r] of [[20, 42, 10], [38, 24, 11], [62, 24, 11], [80, 42, 10]]) ctx.fill(circle(x, y, r));
  }, { tags: 'dog cat pet' }),
  def('doodles', 'butterfly', 'Butterfly', ctx => {
    ctx.fillStyle = '#a06cd5'; ctx.beginPath(); ctx.ellipse(30, 36, 22, 28, -.5, 0, TAU); ctx.ellipse(70, 36, 22, 28, .5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#f28fd5'; ctx.beginPath(); ctx.ellipse(34, 70, 15, 20, .4, 0, TAU); ctx.ellipse(66, 70, 15, 20, -.4, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fill(circle(28, 34, 6)); ctx.fill(circle(72, 34, 6));
    ctx.fillStyle = '#3d2c1e'; ctx.beginPath(); ctx.ellipse(50, 54, 4.5, 28, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#3d2c1e'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(48, 28); ctx.quadraticCurveTo(42, 12, 34, 8); ctx.moveTo(52, 28); ctx.quadraticCurveTo(58, 12, 66, 8); ctx.stroke();
  }, { tags: 'spring' }),
  def('doodles', 'gem', 'Diamond', ctx => {
    paint(ctx, new Path2D('M24 14 H76 L94 38 L50 92 L6 38 Z'), '#7bdff2', '#3a86ff', 3);
    ctx.strokeStyle = '#3a86ff'; ctx.lineWidth = 2; ctx.stroke(new Path2D('M6 38 H94 M24 14 L36 38 L50 92 L64 38 L76 14 M36 38 L50 14 L64 38'));
  }, { tags: 'gem jewel' }),
  def('doodles', 'bow', 'Bow', ctx => {
    ctx.fillStyle = '#ff5d8f';
    ctx.fill(new Path2D('M50 44 C30 14 4 20 8 44 C12 66 34 60 50 50 Z M50 44 C70 14 96 20 92 44 C88 66 66 60 50 50 Z M44 50 L30 92 L40 86 L46 96 L50 54 Z M56 50 L70 92 L60 86 L54 96 L50 54 Z'));
    paint(ctx, circle(50, 47, 9), '#e63972');
  }, { tags: 'ribbon cute', h: 100 }),
  def('doodles', 'peace', 'Peace sign', ctx => { ctx.strokeStyle = '#5a4fcf'; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.stroke(circle(50, 50, 40)); ctx.stroke(new Path2D('M50 12 V88 M50 50 L23 77 M50 50 L77 77')); }),
  def('doodles', 'ice-cream', 'Ice cream cone', ctx => {
    paint(ctx, new Path2D('M30 50 L50 98 L70 50 Z'), '#e9b872', '#c98c3a', 2);
    ctx.strokeStyle = 'rgba(150,95,30,.5)'; ctx.lineWidth = 1.5; ctx.stroke(new Path2D('M36 60 L62 54 M40 70 L60 66 M44 80 L57 77'));
    paint(ctx, circle(50, 40, 22), '#ff9ebb'); paint(ctx, circle(50, 18, 8), '#e63946');
    ctx.fillStyle = '#fff'; for (const [x, y] of [[40, 34], [56, 30], [48, 46], [62, 42]]) ctx.fillRect(x, y, 4, 2);
  }, { tags: 'summer dessert food' }),
  def('doodles', 'planet', 'Planet', ctx => {
    paint(ctx, circle(50, 50, 27), '#ffb703', '#e09f00', 2.5);
    ctx.strokeStyle = '#ef476f'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(50, 52, 47, 12, -.3, 0, TAU); ctx.stroke();
  }, { tags: 'space saturn' }),
  def('doodles', 'rocket', 'Rocket', ctx => {
    paint(ctx, new Path2D('M40 72 Q50 102 60 72 Z'), '#ffb703');
    paint(ctx, new Path2D('M34 56 L18 80 L34 74 Z M66 56 L82 80 L66 74 Z'), '#ef476f');
    paint(ctx, new Path2D('M50 4 C70 20 72 52 66 74 H34 C28 52 30 20 50 4 Z'), '#e9ecef', '#6c757d', 2.5);
    paint(ctx, circle(50, 38, 9), '#4cc9f0', '#6c757d', 2.5);
  }, { tags: 'space launch' }),
  def('doodles', 'check', 'Check mark', ctx => { paint(ctx, circle(50, 50, 46), '#06d6a0'); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 11; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(new Path2D('M28 52 L44 68 L74 34')); }, { tags: 'done yes tick' }),
  def('doodles', 'cupcake', 'Cupcake', ctx => {
    paint(ctx, new Path2D('M20 56 H80 L72 96 H28 Z'), '#4cc9f0'); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 3; ctx.stroke(new Path2D('M38 58 L42 94 M50 58 V94 M62 58 L58 94'));
    paint(ctx, new Path2D('M16 58 C10 40 30 40 30 32 C30 18 44 14 50 22 C56 14 70 18 70 32 C70 40 90 40 84 58 Z'), '#ffafcc');
    paint(ctx, circle(50, 14, 8), '#e63946');
  }, { tags: 'birthday cake party food' }),
  // Scrapbook
  def('scrapbook', 'tape-pink', 'Pink washi tape', tape('rgba(255,166,190,.82)', ctx => { ctx.fillStyle = 'rgba(255,255,255,.55)'; for (let x = 8; x < 100; x += 12) for (let y = 7; y < 28; y += 14) ctx.fill(circle(x + (y > 10 ? 6 : 0), y, 2.6)); }), { h: 28, outline: false }),
  def('scrapbook', 'tape-mint', 'Mint washi tape', tape('rgba(140,214,194,.82)', ctx => { ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 4; for (let x = -30; x < 110; x += 12) { ctx.beginPath(); ctx.moveTo(x, 28); ctx.lineTo(x + 28, 0); ctx.stroke(); } }), { h: 28, outline: false }),
  def('scrapbook', 'tape-kraft', 'Grid washi tape', tape('rgba(222,206,160,.85)', ctx => { ctx.strokeStyle = 'rgba(120,96,50,.25)'; ctx.lineWidth = 1; ctx.beginPath(); for (let x = 0; x < 100; x += 6) { ctx.moveTo(x, 0); ctx.lineTo(x, 28); } for (let y = 2; y < 28; y += 6) { ctx.moveTo(0, y); ctx.lineTo(100, y); } ctx.stroke(); }), { h: 28, outline: false }),
  def('scrapbook', 'tape-yellow', 'Yellow washi tape', tape('rgba(255,214,102,.84)', ctx => { ctx.fillStyle = 'rgba(255,255,255,.5)'; for (let x = 6; x < 100; x += 10) ctx.fill(star(x, 14, 3.6, 1.6)); }), { h: 28, outline: false, tags: 'tape stars' }),
  def('scrapbook', 'tape-check', 'Checked washi tape', tape('rgba(250,250,248,.86)', ctx => { ctx.fillStyle = 'rgba(30,30,30,.7)'; for (let x = 0; x < 100; x += 7) for (let y = 0; y < 28; y += 7) if ((x / 7 + y / 7) % 2 === 0) ctx.fillRect(x, y, 7, 7); }), { h: 28, outline: false, tags: 'tape checker' }),
  def('scrapbook', 'sticky-note', 'Sticky note', ctx => {
    ctx.fillStyle = '#fff3a3'; ctx.fill(new Path2D('M0 0 H100 V78 L78 100 H0 Z')); ctx.fillStyle = '#e8d86c'; ctx.fill(new Path2D('M100 78 L78 78 L78 100 Z'));
    ctx.strokeStyle = 'rgba(120,110,40,.3)'; ctx.lineWidth = 1.5; ctx.stroke(new Path2D('M12 30 H88 M12 48 H88 M12 66 H70'));
  }, { outline: false, tags: 'note memo' }),
  def('scrapbook', 'map-pin', 'Map pin', ctx => { paint(ctx, new Path2D('M50 98 C50 98 14 58 14 38 A36 36 0 0 1 86 38 C86 58 50 98 50 98 Z'), '#ef476f', '#c9184a', 2.5); paint(ctx, circle(50, 38, 13), '#ffffff'); }, { w: 100, h: 100, tags: 'location travel place' }),
  def('scrapbook', 'camera', 'Camera', ctx => {
    paint(ctx, new Path2D('M30 26 L36 12 H64 L70 26 Z'), '#2b2d42'); const body = new Path2D(); body.roundRect(4, 24, 92, 62, 10); paint(ctx, body, '#3d405b');
    paint(ctx, circle(50, 55, 22), '#e0e1dd'); paint(ctx, circle(50, 55, 14), '#1b263b'); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fill(circle(45, 50, 4));
    ctx.fillStyle = '#ffd166'; ctx.fillRect(76, 32, 12, 7);
  }, { h: 90, tags: 'photo selfie' }),
  def('scrapbook', 'film', 'Film strip', ctx => {
    ctx.fillStyle = '#1f1f1f'; ctx.fillRect(0, 0, 100, 40);
    ctx.globalCompositeOperation = 'destination-out'; for (let x = 3; x < 100; x += 8) { ctx.fillRect(x, 3, 4, 4); ctx.fillRect(x, 33, 4, 4); } ctx.globalCompositeOperation = 'source-over';
    ['#f4a261', '#2a9d8f', '#e76f51'].forEach((color, i) => { ctx.fillStyle = color; ctx.fillRect(4 + i * 32, 10, 28, 20); });
  }, { h: 40, tags: 'movie cinema photo' }),
  def('scrapbook', 'paperclip', 'Paper clip', ctx => {
    ctx.strokeStyle = '#9aa3ad'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke(new Path2D('M28 30 V80 A10 10 0 0 1 8 80 V20 A14 14 0 0 1 36 20 V72 A6 6 0 0 1 24 72 V30'));
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.5; ctx.stroke(new Path2D('M7 22 A14 14 0 0 1 20 8'));
  }, { w: 44, h: 100, outline: false }),
  def('scrapbook', 'pushpin', 'Push pin', ctx => {
    ctx.strokeStyle = '#adb5bd'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(30, 56); ctx.lineTo(30, 96); ctx.stroke();
    paint(ctx, new Path2D('M14 50 H46 L40 40 V24 H20 V40 Z'), '#e63946'); paint(ctx, new Path2D('M16 24 A14 10 0 0 1 44 24 A14 6 0 0 1 16 24 Z'), '#ef5160');
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(24, 26, 4, 14);
  }, { w: 60, h: 100, outline: false }),
  def('scrapbook', 'stamp', 'Postage stamp', ctx => {
    ctx.fillStyle = '#fffaf0'; ctx.fillRect(0, 0, 80, 100);
    ctx.globalCompositeOperation = 'destination-out';
    for (let x = 0; x <= 80; x += 8) { ctx.fill(circle(x, 0, 3)); ctx.fill(circle(x, 100, 3)); }
    for (let y = 0; y <= 100; y += 8) { ctx.fill(circle(0, y, 3)); ctx.fill(circle(80, y, 3)); }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#2a9d8f'; ctx.fillRect(9, 9, 62, 70); heart(ctx, 22, 22, 36, '#fffaf0');
    label(ctx, 'POST · 25', 40, 89, 60, 11, '#264653');
  }, { w: 80, h: 100 }),
  def('scrapbook', 'ticket', 'Ticket', ctx => {
    ctx.fillStyle = '#ffd166'; ctx.fillRect(0, 0, 100, 48);
    ctx.globalCompositeOperation = 'destination-out'; ctx.fill(circle(0, 24, 7)); ctx.fill(circle(100, 24, 7)); ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(120,70,0,.45)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(74, 4); ctx.lineTo(74, 44); ctx.stroke(); ctx.setLineDash([]);
    label(ctx, 'ADMIT ONE', 39, 25, 56, 15, '#7a4100'); label(ctx, '№ 07', 87, 25, 18, 10, '#7a4100');
  }, { h: 48 }),
  def('scrapbook', 'tag', 'Gift tag', ctx => {
    const path = new Path2D('M18 4 H96 V46 H18 L2 25 Z'); path.arc(16, 25, 4, 0, TAU);
    ctx.fillStyle = '#c9a66b'; ctx.fill(path, 'evenodd'); label(ctx, 'memories', 56, 26, 66, 18, '#4a3520', STICKER_FONT.replace('800', 'italic 600').replace('system-ui', 'Georgia, serif, system-ui'));
  }, { h: 50 }),
  def('scrapbook', 'arrow', 'Arrow', ctx => {
    ctx.strokeStyle = '#222222'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke(new Path2D('M8 66 C24 16 66 12 90 42')); ctx.stroke(new Path2D('M72 42 L90 42 L88 24'));
  }, { h: 76 }),
  def('scrapbook', 'bubble', 'Speech bubble', ctx => {
    paint(ctx, new Path2D('M14 6 H86 A10 10 0 0 1 96 16 V52 A10 10 0 0 1 86 62 H40 L22 78 L26 62 H14 A10 10 0 0 1 4 52 V16 A10 10 0 0 1 14 6 Z'), '#ffffff', '#222222', 3);
    label(ctx, 'Hi!', 50, 35, 70, 30, '#222222');
  }, { h: 82 }),
  // Pressed & vintage: muted botanicals, line art and paper ephemera for the scrapbook kits (no die-cut outline).
  def('vintage', 'eucalyptus', 'Eucalyptus sprig', ctx => {
    const stem = [32, 99, 26, 70, 40, 38, 30, 2]; ctx.strokeStyle = '#7d8b6b'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.stroke(stemPath(stem));
    along(stem, 9, .1, .97).forEach(({ x, y, a }, i) => { const size = 17 - i * 1.2, side = i % 2 ? 1 : -1;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a + side * 1.25); ctx.fillStyle = i % 3 ? '#9fb19a' : '#8ea38a'; ctx.beginPath(); ctx.ellipse(size * .55, 0, size * .55, size * .36, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(1, 0); ctx.lineTo(size * .9, 0); ctx.stroke(); ctx.restore(); });
  }, { w: 64, outline: false, tags: 'leaf leaves plant green botanical pressed' }),
  def('vintage', 'olive-sprig', 'Leafy sprig', ctx => {
    const stem = [30, 99, 34, 66, 24, 36, 34, 3]; ctx.strokeStyle = '#6f7b55'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.stroke(stemPath(stem));
    along(stem, 10, .08, .98).forEach(({ x, y, a }, i) => leaf(ctx, x, y, 22 - i * 1.3, a + (i % 2 ? 1 : -1) * .75, i % 2 ? '#7f8d5e' : '#8b9968'));
  }, { w: 60, outline: false, tags: 'leaf leaves plant green botanical olive' }),
  def('vintage', 'fern', 'Fern', ctx => {
    const stem = [26, 99, 28, 66, 22, 34, 27, 2]; ctx.strokeStyle = '#6b7a4c'; ctx.lineWidth = 1.4; ctx.stroke(stemPath(stem));
    along(stem, 16, .1, .98).forEach(({ x, y, a }, i) => { const len = 19 * (1 - i / 19); leaf(ctx, x, y, len, a + .95, '#7c8b57', 'rgba(255,255,255,.2)', .22); leaf(ctx, x, y, len, a - .95, '#86955f', 'rgba(255,255,255,.2)', .22); });
  }, { w: 52, outline: false, tags: 'leaf plant green botanical pressed' }),
  def('vintage', 'babys-breath', 'Dried flowers', ctx => driedSpray(ctx, [34, 99],
    [[20, 22, -6], [30, 12, 2], [44, 18, 6], [52, 30, 8], [14, 38, -8], [40, 34, 2], [26, 30, -2], [58, 44, 10]], '#a08a6a', '#f6efe1', '#d8c49e', 2.6),
  { w: 70, outline: false, tags: 'flower flowers dried pressed white gypsophila botanical' }),
  def('vintage', 'golden-flowers', 'Golden dried flowers', ctx => driedSpray(ctx, [36, 99],
    [[18, 20, -6], [34, 10, 0], [50, 22, 6], [24, 40, -4], [46, 40, 6], [60, 34, 10]], '#9a8358', '#e2b552', '#b07b2c', 3),
  { w: 72, outline: false, tags: 'flower flowers dried pressed yellow botanical' }),
  def('vintage', 'blossom', 'Blossom branch', ctx => {
    ctx.strokeStyle = '#7a5a46'; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.stroke(new Path2D('M4 76 C30 64 52 52 96 18 M44 56 C50 40 62 34 70 30 M64 40 C74 46 84 46 92 44'));
    for (const [x, y, r] of [[30, 62, 8], [52, 48, 9], [70, 28, 8], [90, 20, 7], [88, 44, 7], [16, 70, 6], [60, 38, 5]]) {
      for (let k = 0; k < 5; k++) { const a = k * TAU / 5 + x; ctx.fillStyle = k % 2 ? '#efbcc5' : '#e8a9b6'; ctx.fill(circle(x + Math.cos(a) * r * .55, y + Math.sin(a) * r * .55, r * .52)); }
      ctx.fillStyle = '#c4687a'; ctx.fill(circle(x, y, r * .22));
    }
  }, { h: 84, outline: false, tags: 'flower cherry blossom pink spring sakura' }),
  def('vintage', 'line-flower', 'Line-art flower', ctx => {
    ctx.strokeStyle = '#6b5846'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke(new Path2D('M36 99 C34 76 40 56 36 34 M36 34 C24 30 18 18 22 6 C30 12 34 20 36 30 C38 20 44 10 54 6 C56 18 50 30 36 34 M36 34 C30 24 30 14 36 4 C42 14 42 24 36 34'));
    leafLine(ctx, 36, 78, 26, -2.3, .3); leafLine(ctx, 37, 62, 22, -.75, .3);
  }, { w: 70, outline: false, flat: true, tags: 'line art drawing flower tulip minimal outline botanical' }),
  def('vintage', 'line-branch', 'Line-art branch', ctx => {
    ctx.strokeStyle = '#6b5846'; ctx.lineWidth = 1.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const stem = [22, 99, 30, 70, 20, 40, 34, 4]; ctx.stroke(stemPath(stem));
    along(stem, 6, .15, .95).forEach(({ x, y, a }, i) => leafLine(ctx, x, y, 24 - i * 2, a + (i % 2 ? .8 : -.8), .32));
  }, { w: 56, outline: false, flat: true, tags: 'line art drawing leaf leaves minimal outline botanical' }),
  def('vintage', 'swatches', 'Colour palette', ctx => {
    ['#8b8a7c', '#cdb8aa', '#d39f86', '#b9a17d', '#6e6444'].forEach((color, i) => { ctx.fillStyle = '#ffffff'; ctx.fill(circle(14, 12 + i * 19, 9.6)); ctx.fillStyle = color; ctx.fill(circle(14, 12 + i * 19, 8)); });
  }, { w: 28, outline: false, tags: 'palette colours colors swatch moodboard' }),
  def('vintage', 'postmark', 'Postmark', ctx => {
    ctx.strokeStyle = 'rgba(70,66,62,.7)'; ctx.fillStyle = 'rgba(70,66,62,.7)'; ctx.lineWidth = 1.6;
    ctx.stroke(circle(24, 30, 21)); ctx.stroke(circle(24, 30, 15)); label(ctx, 'POST', 24, 30, 20, 9, 'rgba(70,66,62,.75)', STICKER_FONT.replace('800', '700'));
    for (let k = 0; k < 4; k++) { ctx.beginPath(); for (let x = 48; x <= 100; x += 2) ctx.lineTo(x, 15 + k * 10 + Math.sin(x / 5) * 2.4); ctx.stroke(); }
  }, { h: 60, outline: false, flat: true, tags: 'post mail stamp letter travel ink' }),
  def('vintage', 'vintage-stamp', 'Vintage stamp', ctx => {
    ctx.fillStyle = '#f4ead6'; ctx.fillRect(0, 0, 80, 100);
    ctx.globalCompositeOperation = 'destination-out';
    for (let x = 0; x <= 80; x += 8) { ctx.fill(circle(x, 0, 3)); ctx.fill(circle(x, 100, 3)); } for (let y = 0; y <= 100; y += 8) { ctx.fill(circle(0, y, 3)); ctx.fill(circle(80, y, 3)); }
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#b8846d'; ctx.fillRect(9, 9, 62, 66);
    ctx.fillStyle = '#efe1c6'; ctx.fill(new Path2D('M9 75 L28 46 L40 58 L54 36 L71 62 V75 Z')); ctx.fill(circle(56, 24, 7));
    label(ctx, '5 CENTS', 40, 88, 58, 10, '#6e4a3a', STICKER_FONT.replace('800', '700'));
  }, { w: 80, outline: false, tags: 'post mail stamp letter travel' }),
  def('vintage', 'wax-seal', 'Wax seal', ctx => {
    const blob = new Path2D(); for (let k = 0; k <= 24; k++) { const a = k * TAU / 24, r = 45 + Math.sin(k * 2.7) * 3; blob[k ? 'lineTo' : 'moveTo'](50 + Math.cos(a) * r, 50 + Math.sin(a) * r); } blob.closePath();
    paint(ctx, blob, '#b48a3c'); paint(ctx, circle(50, 50, 31), '#c59a4a', '#97702c', 2.5);
    ctx.strokeStyle = '#8b6526'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke(new Path2D('M50 30 V70 M36 40 C44 46 56 46 64 40 M36 60 C44 54 56 54 64 60'));
    ctx.strokeStyle = 'rgba(255,240,200,.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(50, 50, 38, 3.6, 4.6); ctx.stroke();
  }, { outline: false, tags: 'seal letter envelope gold vintage' }),
  def('vintage', 'compass', 'Compass', ctx => {
    paint(ctx, circle(50, 50, 46), '#b48a4a', '#8a6630', 2); paint(ctx, circle(50, 50, 38), '#f3ead6', '#8a6630', 1.5);
    paint(ctx, star(50, 50, 34, 6, 4), '#5c4a36'); paint(ctx, star(50, 50, 22, 5, 4, -Math.PI / 4), '#a08c6c');
    ctx.fillStyle = '#b04a38'; ctx.fill(new Path2D('M50 16 L56 50 L44 50 Z')); paint(ctx, circle(50, 50, 4), '#b48a4a');
  }, { outline: false, tags: 'compass travel map adventure navigation' }),
  def('vintage', 'binder-clip', 'Binder clip', ctx => {
    ctx.strokeStyle = '#a9adb1'; ctx.lineWidth = 3.4; ctx.lineJoin = 'round'; ctx.stroke(new Path2D('M18 40 L10 6 H50 L42 40'));
    paint(ctx, new Path2D('M4 40 H56 L52 92 H8 Z'), '#262422'); ctx.fillStyle = 'rgba(255,255,255,.14)'; ctx.fillRect(8, 44, 44, 6);
  }, { w: 60, outline: false, tags: 'clip office paper' }),
  def('vintage', 'twine', 'Twine bow', ctx => {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [color, width, dash] of [['#9c7b52', 3.2, []], ['rgba(230,206,160,.7)', 1.2, [3, 4]]]) {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash);
      ctx.stroke(new Path2D('M50 30 C30 4 6 12 14 28 C20 40 40 36 50 30 C60 24 80 20 86 30 C94 44 70 50 50 30 M50 30 C44 44 34 52 22 58 M50 30 C58 44 70 50 84 56'));
    }
    ctx.setLineDash([]);
  }, { h: 62, outline: false, tags: 'string bow ribbon rope' }),
  def('vintage', 'admit-one', 'Admit one', ctx => {
    ctx.fillStyle = '#efe3c7'; ctx.fillRect(0, 0, 100, 50); ctx.strokeStyle = '#3e342a'; ctx.lineWidth = 1.6; ctx.strokeRect(5, 5, 90, 40);
    label(ctx, 'ADMIT ONE', 50, 25, 76, 15, '#3e342a', '700 40px "Courier New", Courier, monospace');
  }, { h: 50, outline: false, tags: 'ticket cinema movie retro' }),
  // Words
  def('words', 'love', 'Love', badge('Love', '#ff5d8f'), { h: 40 }),
  def('words', 'hello', 'Hello!', badge('Hello!', '#4cc9f0'), { h: 40 }),
  def('words', 'best-day', 'Best day ever', badge('Best day ever', '#ffb703', '#3d2600', 'banner'), { h: 40 }),
  def('words', 'xoxo', 'XOXO', badge('XOXO', '#9b5de5'), { h: 40 }),
  def('words', 'yay', 'Yay!', badge('Yay!', '#06d6a0', '#063b2c'), { h: 40 }),
  def('words', 'summer', 'Summer vibes', badge('Summer vibes', '#f77f00', '#ffffff', 'banner'), { h: 40 }),
  def('words', 'good-vibes', 'Good vibes', badge('Good vibes', '#80ed99', '#0b3d1a'), { h: 40 }),
  def('words', 'bff', 'BFF', badge('BFF', '#f15bb5'), { h: 40 }),
  def('words', 'omg', 'OMG', badge('OMG', '#3a86ff'), { h: 40 }),
  def('words', 'wow', 'Wow!', ctx => { paint(ctx, star(50, 50, 49, 36, 14), '#ffd23f', '#ef476f', 3); ctx.save(); ctx.translate(50, 50); ctx.rotate(-.12); label(ctx, 'WOW!', 0, 2, 60, 26, '#ef476f'); ctx.restore(); }),
  def('words', 'cute', 'So cute', badge('so cute', '#ffc8dd', '#8a1c4a'), { h: 40 }),
  def('words', 'travel', 'Travel', badge('Travel', '#2a9d8f', '#ffffff', 'banner'), { h: 40 }),
  ...[['lol', 'LOL', '#ffbe0b', '#3d2600'], ['cool', 'Cool!', '#3a86ff'], ['happy-birthday', 'Happy birthday', '#ff5d8f', '#ffffff', 'banner'], ['congrats', 'Congrats!', '#8338ec'],
    ['thank-you', 'Thank you', '#06d6a0', '#063b2c'], ['miss-you', 'Miss you', '#9d4edd'], ['squad', 'Squad', '#ef476f'], ['weekend', 'Weekend', '#fb8500'], ['selfie', 'Selfie', '#4361ee'],
    ['bestie', 'Bestie', '#f15bb5'], ['party', 'Party!', '#ffbe0b', '#3d2600', 'banner'], ['good-luck', 'Good luck', '#2a9d8f'], ['family', 'Family', '#e76f51'], ['happy', 'Happy', '#ffd166', '#3d2600'],
    ['oops', 'Oops!', '#ff006e'], ['yummy', 'Yummy', '#f4a261', '#3d2000'], ['goals', 'Goals', '#118ab2'], ['gg', 'GG', '#7209b7'], ['slay', 'Slay', '#d00000'], ['mood', 'Mood', '#6c757d'],
    ['number-one', 'No. 1', '#ffb703', '#3d2600'], ['cutie', 'Cutie', '#ffafcc', '#8a1c4a'], ['boo', 'Boo!', '#ff7b00'], ['first-day', 'First day', '#4cc9f0', '#062b3a', 'banner'],
    ['graduate', 'Graduate', '#1d3557', '#ffffff', 'banner'], ['merry-christmas', 'Merry Christmas', '#c1121f', '#ffffff', 'banner'], ['new-year', 'Happy New Year', '#14213d', '#ffd166', 'banner'],
    ['vacation', 'Vacation mode', '#00b4d8', '#ffffff', 'banner'], ['love-you', 'Love you', '#e63946'], ['so-proud', 'So proud', '#7b2cbf']]
    .map(([id, text, fill, ink = '#ffffff', shape = 'pill']) => def('words', id, text, badge(text, fill, ink, shape), { h: 40 })),
  ...emojiStickers
];
/** True when every word of `query` starts a word of the sticker's name, tags or group name ("cat" finds Cat, not Vacation). */
export function stickerMatches(sticker, query) {
  const words = String(query).toLowerCase().trim().split(/[\s,]+/).filter(Boolean);
  if (!words.length) return true;
  const group = STICKER_GROUPS.find(([id]) => id === sticker.group)?.[1] || '';
  const hay = `${sticker.name} ${sticker.tags} ${group}`.toLowerCase().split(/[^\p{L}\p{N}]+/u);
  return words.every(word => hay.some(part => part.startsWith(word)));
}

export const stickerById = id => stickers.find(sticker => sticker.id === id) || null;
const maker = (w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));
// Colour emoji fonts are bitmaps on Apple (largest strike 160 px) and Android (136 px); Windows' are vectors. Above
// this font size a glyph is drawn once at it, upscaled smoothly and its edge re-sharpened, instead of letting the
// browser blow the bitmap up into jagged pixels.
const EMOJI_MAX = typeof navigator !== 'undefined' && /Windows/.test(navigator.userAgent) ? Infinity : 136;
const EMOJI_FONT_SHARE = .8; // emoji() draws its glyph 80 units tall in a 100-unit box
/** Render sizes come in 2^(1/8) (≈ 9 %) steps, drawn slightly smaller: crisp, and a resize doesn't redraw every frame. */
const sizeStep = px => Math.round(2 ** (Math.ceil(Math.log2(Math.max(4, px)) * 8) / 8));

/** Steepens the alpha ramp of an upscaled bitmap's edge (×gain around 50 %) so its outline is crisp again. */
function sharpenEdge(ctx, gain) {
  const { width, height } = ctx.canvas, image = ctx.getImageData(0, 0, width, height), data = image.data;
  for (let i = 3; i < data.length; i += 4) { const a = data[i]; if (a && a < 255) data[i] = Math.max(0, Math.min(255, (a - 128) * gain + 128)); }
  ctx.putImageData(image, 0, 0);
}
// Twemoji SVGs: file → { image, state: 'loading'|'ready'|'failed', promise }. Each is read as text and given a large
// intrinsic size (its viewBox alone gives none in some browsers), then drawn as a vector at whatever size is needed.
const emojiArt = new Map(), artListeners = new Set();
/** Calls `listener` whenever a sticker's artwork finishes loading (the preview redraws). */
export const onStickerArt = listener => { artListeners.add(listener); return () => artListeners.delete(listener); };
function loadEmoji(sticker) {
  if (!sticker?.file || typeof Image === 'undefined' || typeof fetch === 'undefined') return Promise.resolve(false);
  let entry = emojiArt.get(sticker.file);
  if (!entry) {
    entry = { image: null, state: 'loading' };
    entry.promise = fetch(sticker.file).then(response => { if (!response.ok) throw new Error(`${response.status}`); return response.text(); })
      .then(text => new Promise((resolve, reject) => {
        const image = new Image(), url = URL.createObjectURL(new Blob([text.replace('<svg ', '<svg width="1024" height="1024" ')], { type: 'image/svg+xml' }));
        image.onload = () => { URL.revokeObjectURL(url); resolve(image); }; image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
        image.src = url;
      }))
      .then(image => { entry.image = image; entry.state = 'ready'; return true; }, () => { entry.state = 'failed'; return false; })
      .then(ok => { for (const key of [...cache.keys()]) if (key.startsWith(`${sticker.id}:`)) cache.delete(key); for (const listener of artListeners) listener(); return ok; });
    emojiArt.set(sticker.file, entry);
  }
  return entry.promise;
}
const emojiReady = sticker => emojiArt.get(sticker.file)?.state === 'ready';
/** Resolves once every emoji sticker in `items` has its artwork (or has fallen back to the system font). For export. */
export const ensureStickerArt = items => Promise.all((items || []).map(item => loadEmoji(stickerById(item.kind))));

/** The sticker's art, `px` wide, at (pad, pad) on ctx. */
function paintArt(ctx, sticker, px, h, pad) {
  const scale = px / sticker.w;
  if (sticker.emoji && emojiReady(sticker)) { // Twemoji fills 88 % of the box, centred, like the font glyph
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(emojiArt.get(sticker.file).image, pad + px * .06, pad + h * .06, px * .88, h * .88); return;
  }
  if (sticker.emoji) loadEmoji(sticker); // drawn with the font for now; redrawn when the SVG arrives
  if (!sticker.emoji || px * EMOJI_FONT_SHARE <= EMOJI_MAX) { ctx.save(); ctx.translate(pad, pad); ctx.scale(scale, scale); sticker.draw(ctx); ctx.restore(); return; }
  const base = Math.floor(EMOJI_MAX / EMOJI_FONT_SHARE), source = maker(base, base), sctx = source.getContext('2d');
  sctx.scale(base / sticker.w, base / sticker.w); sticker.draw(sctx);
  const layer = maker(px, h), lctx = layer.getContext('2d');
  lctx.imageSmoothingEnabled = true; lctx.imageSmoothingQuality = 'high'; lctx.drawImage(source, 0, 0, px, h);
  sharpenEdge(lctx, Math.min(8, .75 * px / base));
  ctx.drawImage(layer, pad, pad);
}

/** A sticker rendered about `width` px wide (see sizeStep), with its die-cut outline, on a canvas padded by `pad` px. Cached. */
// Bounded by pixels, not entries: a few export-size stickers would otherwise hold hundreds of MB on a phone. Stickers
// above CACHE_MAX_PX wide (exports) are drawn without being kept.
const cache = new Map(), CACHE_MAX_PX = 1024, CACHE_PIXELS = 16e6;
let cachedPixels = 0;
const pixelsOf = entry => entry.canvas.width * entry.canvas.height;
export function stickerCanvas(sticker, width) {
  const px = sizeStep(width), key = `${sticker.id}:${px}`;
  if (cache.has(key)) { const entry = cache.get(key); cache.delete(key); cache.set(key, entry); return entry; } // most recently used last
  const h = Math.round(sticker.h * px / sticker.w), ring = sticker.outline ? Math.max(1.5, px * .035) : 0, pad = Math.ceil(ring + 2);
  const art = maker(px + 2 * pad, h + 2 * pad), actx = art.getContext('2d');
  paintArt(actx, sticker, px, h, pad);
  let out = art;
  if (ring) {
    // The outline: the white silhouette stamped around two circles (full and half the ring), close enough that the
    // edge stays round and thin parts (the arrow, the peace sign) get no gaps.
    const silhouette = maker(art.width, art.height), sctx = silhouette.getContext('2d');
    sctx.drawImage(art, 0, 0); sctx.globalCompositeOperation = 'source-in'; sctx.fillStyle = '#ffffff'; sctx.fillRect(0, 0, art.width, art.height);
    out = maker(art.width, art.height); const octx = out.getContext('2d');
    for (const radius of [ring, ring / 2]) {
      const n = Math.max(16, Math.min(120, Math.ceil(Math.PI * 2 * radius / 1.5)));
      for (let i = 0; i < n; i++) { const a = i * TAU / n; octx.drawImage(silhouette, Math.cos(a) * radius, Math.sin(a) * radius); }
    }
    octx.drawImage(silhouette, 0, 0); octx.drawImage(art, 0, 0);
  }
  const entry = { canvas: out, pad };
  if (px > CACHE_MAX_PX) return entry;
  cache.set(key, entry); cachedPixels += pixelsOf(entry);
  while (cachedPixels > CACHE_PIXELS || cache.size > 120) { const [oldest, old] = cache.entries().next().value; cache.delete(oldest); cachedPixels -= pixelsOf(old); }
  return entry;
}

/** A placed sticker's box on a laid-out sheet, in px: centre, size and rotation (degrees). */
export function stickerBox(item, layout) {
  const sticker = stickerById(item.kind); if (!sticker) return null;
  const short = Math.min(layout.width, layout.height), w = item.size * short;
  return { cx: item.x * layout.width, cy: item.y * layout.height, w, h: w * sticker.h / sticker.w, rotate: item.rotate || 0, sticker };
}

/** Draws the document's stickers (in list order: later ones on top), each with a soft shadow. */
export function drawStickers(ctx, doc, layout) {
  for (const item of doc.stickers || []) {
    const box = stickerBox(item, layout); if (!box || box.w < 1) continue;
    const { canvas, pad } = stickerCanvas(box.sticker, box.w), k = box.w / (canvas.width - 2 * pad);
    ctx.save(); ctx.translate(box.cx, box.cy); ctx.rotate(box.rotate * Math.PI / 180); if (item.flip) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (!box.sticker.flat) { ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = box.w * .035; ctx.shadowOffsetY = box.w * .015; }
    ctx.drawImage(canvas, -canvas.width * k / 2, -canvas.height * k / 2, canvas.width * k, canvas.height * k);
    ctx.restore();
  }
}

/** Removes stickers that don't describe a known sticker with finite numbers (saved documents). */
export function cleanStickers(list) {
  const ok = value => Number.isFinite(value);
  return (Array.isArray(list) ? list : []).filter(item => item && typeof item.id === 'string' && stickerById(item.kind) && ok(item.x) && ok(item.y) && ok(item.size) && item.size > 0 && ok(item.rotate ?? 0))
    .map(({ id, kind, x, y, size, rotate = 0, flip = false, kit }) => ({ id, kind, x, y, size, rotate, flip: Boolean(flip), ...(typeof kit === 'string' ? { kit } : {}) }));
}
