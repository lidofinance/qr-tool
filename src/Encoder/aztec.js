export default function aztec({ text, ecc = 23, layers = 0, width = 500 }) {
  const out = [];

  const setCell = (x, y) => {
    out.push([x, y]);
  };
  // make Aztec bar code
  var enc,
    eb,
    ec,
    el = text.length,
    b,
    typ = 0;
  var mod; // encoding mode: upper/lower/mixed/punct/digit
  function push(val, bits) {
    // add data to bit stream
    val <<= b;
    eb += bits || (mod === 4 ? 4 : 5);
    enc[enc.length - 1] |= val >> eb; // add data
    while (eb >= b) {
      // word full?
      var i = enc[enc.length - 1] >> 1;
      if (typ === 0 && (i === 0 || 2 * i + 2 === 1 << b)) {
        // bit stuffing: all 0 or 1
        enc[enc.length - 1] = 2 * i + ((1 & i) ^ 1); // insert complementary bit
        eb++;
      }
      eb -= b;
      enc.push((val >> eb) & ((1 << b) - 1));
    }
  }
  function encode(text) {
    // process input text
    function modeOf(ch) {
      // get character encoding mode of ch
      if (ch === 32) return mod << 5; // space
      var k = [
        0, 14, 65, 26, 32, 52, 32, 48, 69, 47, 58, 82, 57, 64, 59, 64, 91, -63,
        96, 123, -63,
      ];
      for (
        var i = 0;
        i < k.length;
        i += 3 // check range
      )
        if (ch > k[i] && ch < k[i + 1]) break;
      if (i < k.length) return ch + k[i + 2]; // ch in range
      i = [64, 92, 94, 95, 96, 124, 126, 127, 91, 93, 123, 125].indexOf(ch); // "@\^_'|~вЊ‚[]{}"
      if (i < 0) return -1; // binary
      return (i < 8 ? 20 + 64 : 27 + 96 - 8) + i; // mixed/punct
    }
    enc = [0];
    mod = eb = 0; // clr bit stream
    for (var i = 0; i < text.length; i++) {
      // analyse text, optimize most cases
      var c = text.charCodeAt(i),
        c1 = 0,
        m;
      if (i < text.length - 1) c1 = text.charCodeAt(i + 1);
      if (c === 32) {
        // space
        if (mod === 3) {
          push(31);
          mod = 0;
        } // punct: latch to upper
        c = 1; // space in all other modes
      } else if (mod === 4 && c === 44) c = 12;
      // , in digit mod
      else if (mod === 4 && c === 46) c = 13;
      // . in digit mod
      else if (
        ((c === 44 || c === 46 || c === 58) && c1 === 32) ||
        (c === 13 && c1 === 10)
      ) {
        if (mod !== 3) push(0); // shift to punct
        push(c === 46 ? 3 : c === 44 ? 4 : c === 58 ? 5 : 2, 5); // two char encoding
        i++;
        continue;
      } else {
        c = c === 13 && modeOf(c1) >> 5 === mod ? 97 : modeOf(c);
        if (c < 0) {
          // binary
          if (mod > 2) {
            push(mod === 3 ? 31 : 14);
            mod = 0;
          } // latch to upper
          push(31); // shift to binary
          for (
            var l = 0, j = 0;
            l + i < text.length;
            l++ // calc binary length
          )
            if (modeOf(text.charCodeAt(l + i)) < 0) j = 0;
            else if (j++ > 5) break; // look for at least 5 consecutive non binary chars
          if (l > 31) {
            // length > 31
            push(0);
            push(l - 31, 11);
          } else push(l);
          while (l--) push(text.charCodeAt(i++) & 255, 8);
          i--;
          continue;
        }
        m = c >> 5; // need mode
        if (m === 4 && mod === 2) {
          push(29);
          mod = 0;
        } // mixed to upper (to digit)
        if (m !== 3 && mod === 3) {
          push(31);
          mod = 0;
        } // exit punct: to upper
        if (m !== 4 && mod === 4) {
          // exit digit
          if ((m === 3 || m === 0) && modeOf(c1) > 129) {
            push((3 - m) * 5);
            push(c & 31, 5);
            continue; // shift to punct/upper
          }
          push(14);
          mod = 0; // latch to upper
        }
        if (mod !== m) {
          // mode change needed
          if (m === 3) {
            // to punct
            if (mod !== 4 && modeOf(c1) >> 5 === 3) {
              // 2x punct, latch to punct
              if (mod !== 2) push(29); // latch to mixed
              push(30); // latch to punct
              mod = 3; // punct mod
            } else push(0); // shift to punct
          } else if (mod === 1 && m === 0) {
            // lower to upper
            if (modeOf(c1) >> 5 === 1) push(28);
            // shift
            else {
              push(30);
              push(14, 4);
              mod = 0;
            } // latch
          } else {
            // latch to ..
            push([29, 28, 29, 30, 30][m]);
            mod = m;
          }
        }
      }
      push(c & 31); // stream character
    }
    if (eb > 0) push((1 << (b - eb)) - 1, b - eb); // padding
    enc.pop(); // remove 0-byte
  }
  /** compute word size b: 6/8/10/12 bits */
  var x, y, dx, dy, ctr, c, i, j, l;
  ecc = 100 / (100 - Math.min(Math.max(ecc || 25, 0), 90)); // limit percentage of check words to 0-90%
  for (j = i = 4; ; i = b) {
    // compute code size
    j = Math.max(j, (Math.floor(el * ecc) + 3) * i); // total needed bits, at least 3 check words
    b = j <= 240 ? 6 : j <= 1920 ? 8 : j <= 10208 ? 10 : 12; // bit capacity -> word size
    if (layers)
      b = Math.max(b, layers < 3 ? 6 : layers < 9 ? 8 : layers < 23 ? 10 : 12); // parameter
    if (i >= b) break;
    encode(text);
    el = enc.length;
  }
  if (el > 1660) throw new Error("Message too long"); // message too long
  typ = j > 608 || el > 64 ? 14 : 11; // full or compact Aztec finder size
  mod = parseInt(text); // Aztec rune possible?
  if (mod >= 0 && mod < 256 && mod + "" === text && !layers) layers = 0;
  // Aztec rune 0-255
  else
    layers = Math.max(
      layers || 0,
      Math.min(32, Math.ceil((Math.sqrt(j + typ * typ) - typ) / 4))
    ); // needed layers
  ec = Math.floor((8 * layers * (typ + 2 * layers)) / b) - el; // # of error words
  typ >>= 1;
  ctr = typ + 2 * layers;
  ctr += ((ctr - 1) / 15) | 0; // center position

  /** compute Reed Solomon error detection and correction */
  function rs(ec, s, p) {
    // # of checkwords, polynomial bit size, generator polynomial
    var rc = new Array(ec + 2),
      i,
      j,
      x,
      el = enc.length; // reed/solomon code
    var lg = new Array(s + 1),
      ex = new Array(s); // log/exp table for multiplication
    for (j = 1, i = 0; i < s; i++) {
      // compute log/exp table of Galois field
      ex[i] = j;
      lg[j] = i;
      j += j;
      if (j > s) j ^= p; // GF polynomial
    }
    for (rc[ec + 1] = i = 0; i <= ec; i++) {
      // compute RS generator polynomial
      for (j = ec - i, rc[j] = 1; j++ < ec; )
        rc[j] = rc[j + 1] ^ ex[(lg[rc[j]] + i) % s];
      enc.push(0);
    }
    for (
      i = 0;
      i < el;
      i++ // compute RS checkwords
    )
      for (j = 0, x = enc[el] ^ enc[i]; j++ < ec; )
        enc[el + j - 1] = enc[el + j] ^ (x ? ex[(lg[rc[j]] + lg[x]) % s] : 0);
  }
  /** layout Aztec barcode */
  for (
    y = 1 - typ;
    y < typ;
    y++ // layout central finder
  )
    for (x = 1 - typ; x < typ; x++)
      if ((Math.max(Math.abs(x), Math.abs(y)) & 1) === 0)
        setCell(ctr + x, ctr + y);
  setCell(ctr - typ, ctr - typ + 1);
  setCell(ctr - typ, ctr - typ); // orientation marks
  setCell(ctr - typ + 1, ctr - typ);
  setCell(ctr + typ, ctr + typ - 1);
  setCell(ctr + typ, ctr - typ + 1);
  setCell(ctr + typ, ctr - typ);
  function move(dx, dy) {
    // move one cell
    do x += dx;
    while (typ === 7 && (x & 15) === 0); // skip reference grid
    do y += dy;
    while (typ === 7 && (y & 15) === 0);
  }
  if (layers > 0) {
    // layout the message
    rs(ec, (1 << b) - 1, [67, 301, 1033, 4201][b / 2 - 3]); // error correction, generator polynomial
    enc.pop(); // remove 0-byte
    x = -typ;
    y = x - 1; // start of layer 1 at top left
    j = l = (3 * typ + 9) / 2; // length of inner side
    dx = 1;
    dy = 0; // direction right
    while ((c = enc.pop()) !== undefined)
      // data in reversed order inside to outside
      for (i = b / 2; i-- > 0; c >>= 2) {
        if (c & 1) setCell(ctr + x, ctr + y); // odd bit
        move(dy, -dx); // move across
        if (c & 2) setCell(ctr + x, ctr + y); // even bit
        move(dx - dy, dx + dy); // move ahead
        if (j-- === 0) {
          // spiral turn
          move(dy, -dx); // move across
          j = dx;
          dx = -dy;
          dy = j; // rotate clockwise
          if (dx < 1)
            // move to next side
            for (j = 2; j--; ) move(dx - dy, dx + dy);
          else l += 4; // full turn -> next layer
          j = l; // start new side
        }
      }
    if (typ === 7)
      // layout reference grid
      for (x = (15 - ctr) & -16; x <= ctr; x += 16)
        for (y = (1 - ctr) & -2; y <= ctr; y += 2)
          if (Math.abs(x) > typ || Math.abs(y) > typ) {
            setCell(ctr + x, ctr + y); // down
            if (y & 15) setCell(ctr + y, ctr + x); // across
          }
    mod = (layers - 1) * (typ * 992 - 4896) + el - 1; // 2/5 + 6/11 mode bits
  }
  /** process modes message compact/full */
  for (i = typ - 3; i-- > 0; mod >>= 4) enc[i] = mod & 15; // mode to 4 bit words
  rs((typ + 5) / 2, 15, 19); // add 5/6 words error correction
  b = (typ * 3 - 1) / 2; // 7/10 bits per side
  j = layers ? 0 : 10; // XOR Aztec rune data
  for (eb = i = 0; i < b; i++) push(j ^ enc[i], 4); // 8/16 words to 4 chunks
  for (i = 2 - typ, j = 1; i < typ - 1; i++, j += j) {
    // layout mode data
    if (typ === 7 && i === 0) i++; // skip reference grid
    if (enc[b] & j) setCell(ctr - i, ctr - typ); // top
    if (enc[b + 1] & j) setCell(ctr + typ, ctr - i); // right
    if (enc[b + 2] & j) setCell(ctr + i, ctr + typ); // bottom
    if (enc[b + 3] & j) setCell(ctr - typ, ctr + i); // left
  }

  const size = 2 * ctr + 1;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = width;
  canvas.height = width;
  ctx.fillStyle = "#fff";

  ctx.fillRect(0, 0, width, width);
  const kf = width / size;
  for (const [x, y] of out) {
    ctx.rect(x * kf, y * kf, kf, kf);
  }
  ctx.fillStyle = "#000";
  ctx.fill();
  const data = canvas.toDataURL();
  canvas.remove();
  return data;
}
