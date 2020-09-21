import { format } from "https://deno.land/std@0.70.0/datetime/mod.ts";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.2-alpha4/deno-dom-wasm.ts";

const callistoServerURL =
  "http://soleil.i4ds.ch/solarradio/data/2002-20yy_Callisto";

const today = format(new Date(), "yyyy/MM/dd");

const callistoDateURL = `${callistoServerURL}/${today}`;

const res = await fetch(callistoDateURL);

const body = new Uint8Array(await res.arrayBuffer());

const decoder = new TextDecoder();
const decodedBody = decoder.decode(body);

const doc = new DOMParser().parseFromString(decodedBody, "text/html")!;

const links = doc.querySelectorAll("a")!;

const fits = Array.from(links).map((link) => link.childNodes[0].nodeValue)
  .filter((nodeValue) => nodeValue?.includes(".fit.gz"));

console.log(fits);
