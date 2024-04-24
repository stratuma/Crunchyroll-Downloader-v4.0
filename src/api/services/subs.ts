import fs from 'fs'
import { parse, stringify } from 'ass-compiler'
import { Readable } from 'stream'
import { finished } from 'stream/promises'
import CryptoJS from 'crypto-js'

export async function downloadCRSub(
  sub: {
    format: string
    language: string
    url: string
    isDub: boolean
  },
  dir: string
) {
  const path = `${dir}/${sub.language}${sub.isDub ? `-FORCED` : ''}.${sub.format}`

  const stream = fs.createWriteStream(path)
  const response = await fetch(sub.url)

  var resampledSubs = resamplePOSSubtitle(await response.text())

  var parsedASS = parse(resampledSubs)

  parsedASS.info['Original Script'] = 'crd  [https://github.com/stratuma/]'

  parsedASS.info.PlayResX = "1920";
  parsedASS.info.PlayResY = "1080";

  for (const s of parsedASS.styles.style) {
    if (s.Fontname === 'Arial') {
      (s.Fontsize = "54"), (s.Outline = "4"), (s.MarginV = "60");
    }
    if (s.Name === 'TypePlaceholder') {
      (s.Fontsize = "57"), (s.Outline = "4"), (s.MarginL = "30"), (s.MarginR = "30"), (s.MarginV = "60");
    }
  }

  const fixed = stringify(parsedASS)

  const readableStream = Readable.from([fixed])

  await finished(readableStream.pipe(stream))
  console.log(`Sub ${sub.language}.${sub.format} downloaded`)

  return path
}

function resamplePOSSubtitle(subtitle: string) {
  let lines = subtitle.split('\n');

  for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      if (line.includes("\\pos(")) {
          let posMatch = line.match(/\\pos\((\d+),(\d+)\)/);
          if (posMatch) {
              let oldX = parseInt(posMatch[1]);
              let oldY = parseInt(posMatch[2]);

              let newX = Math.round((oldX / 640) * 1920);
              let newY = Math.round((oldY / 360) * 1080);

              let newPos = `\\pos(${newX},${newY})`;

              line = line.replace(/\\pos\(\d+,\d+\)/, newPos);
              lines[i] = line;
          }
      }
  }

  return lines.join('\n');
}

export async function downloadADNSub(link: string, dir: string, secret: string) {
  var templateASS = `[Script Info]
; Script generated by Aegisub 3.2.2
; http://www.aegisub.org/
Title: Deutsch
Original Script: crd  [https://github.com/stratuma/]
Original Translation: 
Original Editing: 
Original Timing: 
Synch Point: 
Script Updated By: 
Update Details: 
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
Timer: 0.0000
WrapStyle: 0

[Aegisub Project Garbage]

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,56,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,4,0,2,0,0,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`
  const path = `${dir}/de-DE.ass`

  const stream = fs.createWriteStream(path)
  const subURLFetch = await fetch(link)
  const subURL: {
    location: string
  } = JSON.parse(await subURLFetch.text())

  const rawSubsFetch = await fetch(subURL.location)
  const rawSubs = await rawSubsFetch.text()

  const subs = await ADNparseSub(rawSubs, secret)

  const parsedSubs: {
    vde: Array<{
      startTime: number
      endTime: number
      positionAligh: string
      lineAlign: string
      text: string
    }>,
    vostde: Array<{
      startTime: number
      endTime: number
      positionAligh: string
      lineAlign: string
      text: string
    }>,
  } = await JSON.parse(subs)

  if (parsedSubs.vde) {
    for (const s of parsedSubs.vde) {
      const convertedStart = convertToTimeFormat(s.startTime)
      const convertedEnd = convertToTimeFormat(s.endTime)
  
      templateASS = templateASS + `Dialogue: 0,${convertedStart},${convertedEnd},Default,,0,0,0,,${s.text.replace('\n', '\\N').replace('<i>', '{\\i1}').replace('</i>', '{\\i0}')}\n`
    }
  }

  if (parsedSubs.vostde) {
    for (const s of parsedSubs.vostde) {
      const convertedStart = convertToTimeFormat(s.startTime)
      const convertedEnd = convertToTimeFormat(s.endTime)
  
      templateASS = templateASS + `Dialogue: 0,${convertedStart},${convertedEnd},Default,,0,0,0,,${s.text.replace('\n', '\\N').replace('<i>', '{\\i1}').replace('</i>', '{\\i0}')}\n`
    }
  }

  // Disabling Changing ASS because still broken in vlc

  // parsedASS.info.PlayResX = "1920";
  // parsedASS.info.PlayResY = "1080";

  // for (const s of parsedASS.styles.style) {
  //     (s.Fontsize = "54"), (s.Outline = "4");
  // }

  // const fixed = stringify(parsedASS)

  const readableStream = Readable.from([templateASS])

  await finished(readableStream.pipe(stream))
  console.log(`Sub downloaded`)

  return path
}

function convertToTimeFormat(time: number) {
  var seconds: number | string = Math.floor(time);
  var milliseconds = Math.round((time - seconds) * 1000);

  var hours: number | string = Math.floor(seconds / 3600);
  var minutes: number | string = Math.floor((seconds % 3600) / 60);
  seconds = seconds % 60;

  hours = String(hours).padStart(2, '0');
  minutes = String(minutes).padStart(2, '0');
  seconds = String(seconds).padStart(2, '0');

  milliseconds = Math.round(milliseconds / 10);

  var formattedMilliseconds = milliseconds < 10 ? '0' + milliseconds : milliseconds;

  var formattedTime = hours + ':' + minutes + ':' + seconds + '.' + formattedMilliseconds;
  return formattedTime;
}

export async function ADNparseSub(raw: string, secret: string) {
  var key = secret + '7fac1178830cfe0c'

  console.log(key)

  var parsedSubtitle = CryptoJS.enc.Base64.parse(raw.substring(0, 24))
  var sec = CryptoJS.enc.Hex.parse(key)
  var som = raw.substring(24)

  try {
    // Fuck You ADN
    var decrypted: any = CryptoJS.AES.decrypt(som, sec, { iv: parsedSubtitle })
    decrypted = decrypted.toString(CryptoJS.enc.Utf8)
    return decrypted
  } catch (error) {
    console.error('Error decrypting subtitles:', error)
    return null
  }
}
