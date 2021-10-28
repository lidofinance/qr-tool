class ReedSolomon {
  nSym: number;
  codec: ReedSolomonCodec;
  constructor(nSym?: number) {
    this.nSym = nSym || 10;
    this.codec = new ReedSolomonCodec();
  }

  encode(data: number[]) {
    var chunkSize = 255 - this.nSym;
    var enc: number[] = [];

    for (let i = 0; i < data.length; i += chunkSize) {
      var chunk = data.slice(i, i + chunkSize);
      enc = enc.concat(this.codec.encodeMsg(chunk, this.nSym));
    }

    return enc;
  }

  decode(data: number[]) {
    let dec: number[] = [];
    // const data = ReedSolomonUtils.unpack(str);
    for (let i = 0; i < data.length; i += 255) {
      var chunk = data.slice(i, i + 255);
      dec = dec.concat(this.codec.correctMsg(chunk, this.nSym));
    }

    return dec;
  }
}

class ReedSolomonUtils {
  static pack(bytes: number[]): string {
    return bytes.map((byte) => String.fromCharCode(byte)).join("");
  }

  static unpack(str: string): number[] {
    return str.split("").map((c) => c.charCodeAt(0));
  }

  static arrayFill(size: number, value: number): number[] {
    return new Array(size).fill(value);
  }

  static sliceStep(array: any[], from: number, to: number, step: number) {
    var result = Array.prototype.slice.call(array, from, to);

    var final = [];

    for (let i = result.length - 1; i >= 0; i--) {
      i % step === 0 && final.push(result[i]);
    }

    final.reverse();
    result = final;

    return result;
  }
}

class ReedSolomonGaloisField {
  gfExp: number[];
  gfLog: number[];
  constructor() {
    this.gfExp = ReedSolomonUtils.arrayFill(512, 1);
    this.gfLog = ReedSolomonUtils.arrayFill(256, 0);
    var x = 1;

    for (let i = 1; i < 255; i++) {
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
      this.gfExp[i] = x;
      this.gfLog[x] = i;
    }

    for (let i = 255; i < 512; i++) {
      this.gfExp[i] = this.gfExp[i - 255];
    }
  }

  mul(x: number, y: number) {
    if (x === 0 || y === 0) return 0;
    return this.gfExp[this.gfLog[x] + this.gfLog[y]];
  }

  div(x: number, y: number) {
    if (y === 0) throw new Error("Division by zero.");
    if (x === 0) return 0;

    return this.gfExp[this.gfLog[x] + 255 - this.gfLog[y]];
  }

  polyScale(p: number[], x: number) {
    var r = [];
    for (var i = 0; i < p.length; i++) r.push(this.mul(p[i], x));

    return r;
  }

  polyAdd(p: number[], q: number[]) {
    var pLen = p.length,
      qLen = q.length,
      maxLen = Math.max(pLen, qLen),
      r = ReedSolomonUtils.arrayFill(maxLen, 0),
      rLen = r.length;

    for (let i = 0; i < pLen; i++) r[i + rLen - pLen] = p[i];

    for (let i = 0; i < qLen; i++) r[i + rLen - qLen] ^= q[i];

    return r;
  }

  polyMul(p: number[], q: number[]) {
    const r = ReedSolomonUtils.arrayFill(p.length + q.length - 1, 0);

    for (let j = 0; j < q.length; j++) {
      for (let i = 0; i < p.length; i++) {
        r[i + j] ^= this.mul(p[i], q[j]);
      }
    }

    return r;
  }

  polyEval(p: number[], x: number) {
    let y = p[0];

    for (var i = 1; i < p.length; i++) y = this.mul(y, x) ^ p[i];

    return y;
  }
}

class ReedSolomonCodec {
  gf: ReedSolomonGaloisField;
  constructor() {
    this.gf = new ReedSolomonGaloisField();
  }

  generatorPoly(nSym: number) {
    var g = [1];

    for (var i = 0; i < nSym; i++) {
      g = this.gf.polyMul(g, [1, this.gf.gfExp[i]]);
    }

    return g;
  }

  encodeMsg(msgIn: number[], nSym: number) {
    if (msgIn.length + nSym > 255) throw new Error("Message too long.");

    const gen = this.generatorPoly(nSym);
    const msgOut = ReedSolomonUtils.arrayFill(msgIn.length + nSym, 0);

    for (let i = 0; i < msgIn.length; i++) msgOut[i] = msgIn[i];

    for (let i = 0; i < msgIn.length; i++) {
      var coef = msgOut[i];
      if (coef !== 0) {
        for (var j = 0; j < gen.length; j++) {
          msgOut[i + j] ^= this.gf.mul(gen[j], coef);
        }
      }
    }

    for (let i = 0; i < msgIn.length; i++) msgOut[i] = msgIn[i];

    return msgOut;
  }

  calcSyndromes(msg: number[], nSym: number) {
    var r = [];

    for (var i = 0; i < nSym; i++)
      r.push(this.gf.polyEval(msg, this.gf.gfExp[i]));

    return r;
  }

  correctErrata(msg: number[], synd: number[], pos: number[]) {
    var q = [1];
    var x;

    for (let i = 0; i < pos.length; i++) {
      x = this.gf.gfExp[msg.length - 1 - pos[i]];
      q = this.gf.polyMul(q, [x, 1]);
    }

    var p = synd.slice(0, pos.length);

    p.reverse();

    p = this.gf.polyMul(p, q);
    p = p.slice(p.length - pos.length, p.length);
    q = ReedSolomonUtils.sliceStep(q, q.length & 1, q.length, 2);

    for (let i = 0; i < pos.length; i++) {
      x = this.gf.gfExp[pos[i] + 256 - msg.length];
      var y = this.gf.polyEval(p, x);
      var z = this.gf.polyEval(q, this.gf.mul(x, x));
      msg[pos[i]] ^= this.gf.div(y, this.gf.mul(x, z));
    }

    return msg;
  }

  rsFindErrors(synd: number[], nMess: number) {
    var errPoly = [1],
      oldPoly = [1];
    var newPoly;

    for (var i = 0; i < synd.length; i++) {
      oldPoly.push(0);
      var delta = synd[i];

      for (var j = 1; j < errPoly.length; j++) {
        delta ^= this.gf.mul(errPoly[errPoly.length - 1 - j], synd[i - j]);
      }

      if (delta !== 0) {
        if (oldPoly.length > errPoly.length) {
          newPoly = this.gf.polyScale(oldPoly, delta);
          oldPoly = this.gf.polyScale(errPoly, this.gf.div(1, delta));
          errPoly = newPoly;
        }
        errPoly = this.gf.polyAdd(errPoly, this.gf.polyScale(oldPoly, delta));
      }
    }

    var errs = errPoly.length - 1;
    if (errs * 2 > synd.length) throw new Error("Too many errors to correct");

    var errPos = [];

    for (let i = 0; i < nMess; i++) {
      if (this.gf.polyEval(errPoly, this.gf.gfExp[255 - i]) === 0)
        errPos.push(nMess - 1 - i);
    }

    if (errPos.length !== errs) return null;

    return errPos;
  }

  forneySyndromes(synd: number[], pos: number[], nMess: number) {
    let fsynd = synd.slice(0);

    for (let i = 0; i < pos.length; i++) {
      var x = this.gf.gfExp[nMess - 1 - pos[i]];

      for (var j = 0; j < fsynd.length - 1; j++) {
        fsynd[j] = this.gf.mul(fsynd[j], x) ^ fsynd[j + 1];
      }

      fsynd.pop();
    }

    return fsynd;
  }

  correctMsg(msgIn: number[], nSym: number) {
    if (msgIn.length > 255) throw new Error("Message too long");

    var msgOut = msgIn.slice(0);
    var erasePos = [];

    for (let i = 0; i < msgOut.length; i++) {
      if (msgOut[i] < 0) {
        msgOut[i] = 0;
        erasePos.push(i);
      }
    }

    if (erasePos.length > nSym) throw new Error("Too many erasures to correct");

    var synd = this.calcSyndromes(msgOut, nSym);

    if (Math.max.apply(null, synd) === 0) {
      return msgOut.slice(0, msgOut.length - nSym);
    }

    var fsynd = this.forneySyndromes(synd, erasePos, msgOut.length);

    var errPos = this.rsFindErrors(fsynd, msgOut.length);

    if (errPos == null) throw new Error("Could not locate error");

    msgOut = this.correctErrata(msgOut, synd, erasePos.concat(errPos));

    synd = this.calcSyndromes(msgOut, nSym);

    if (Math.max.apply(null, synd) > 0)
      throw new Error("Could not correct message");

    return msgOut.slice(0, -nSym);
  }
}

export default ReedSolomon;

// const content = Array(50).fill("s").join("");
// var rs = new ReedSolomon(10);
// console.log(`Content length ${content.length}`);
// var enco = rs.encode(content);
// console.log(`Enc length ${enco.length}`, enco);
// const t = Date.now();
// for (let i = 0; i < 500; i++) {
//   const enc = [...enco];
//   for (let j = 0; j < 5; j++) {
//     enc[Math.round(Math.random() * enc.length)] = 0;
//   }
//   var msg = rs.decode(enc);
// }
// console.log(Date.now() - t);
// console.log(msg == content);
