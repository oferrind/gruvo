# 03 · The Sound Fingerprint engine

The Blind Test now picks its next mystery by **listening** to the music, not by asking Deezer what other fans like.

## 1. Listening (the fingerprint)

Each candidate's 30 s preview is downloaded (Deezer/Apple preview servers only, https,
max 2 MB) and its middle 20 seconds are turned into 14 numbers between 0 and 1:

| Number | What it hears |
|---|---|
| Tempo | Beats per minute, 60-200, from how the note onsets repeat |
| Loudness | Average volume |
| Dynamics | How much the volume moves around |
| Brightness | Where the "centre of gravity" of the sound sits: low = dark and warm, high = bright and airy |
| Noisiness | Hiss and distortion versus clean tones |
| Percussiveness | How many sharp hits per second |
| Timbre (8 numbers) | How the energy is spread from deep bass (60 Hz) to high treble (11 kHz) |

All of this is plain arithmetic in `renderer/features.js`; no service is asked.

## 2. Learning your taste

Every rating (Skip, OK and Love) stores the track's 14 numbers in your profile
(the newest 500). A new track is then scored by how close it sounds to:

- your nearest **Love** (counts fully),
- your nearest **OK** (counts 30%),
- your nearest **Skip** (counts *against* it, 70%).

## 3. The Adventure slider

- **Low**: the closest-sounding track to something you loved wins.
- **High**: the winner is a deliberate *stretch*, about as different from your
  loves as two unrelated songs, while anything that sounds like a Skip is pushed
  down even harder. So it wanders, but never back to what you rejected.

## 4. Where candidates come from

The app keeps about 6 fingerprinted candidates ready, drawn in turn from:
1. **Random trips**: a random country and decade (MusicBrainz).
2. **Producer trails**: the producer/engineer/player of a track you loved, then another
   artist they worked with (slow at first: MusicBrainz allows 1 request per 1.5 s).
3. **Deezer neighbours**: now just one source in five.

Until you have rated 3 tracks, or while the pool is still being listened to, the
Blind Test works as before so the first mystery plays within about 2 seconds.

## 5. The reveal

After you rate, the reveal says why it was chosen, e.g.
> The driving ~130 BPM pulse of "Waltz #2 (XO)" by Elliott Smith, but cleaner; found via Paul Q. Kolderie, engineer on "Creep", who was also mixer on this one
The artist and title never reach the screen before you rate.

## Limits
- Tempo can land on half or double the real speed for unusual rhythms.
- 14 numbers describe "sound", not melody, lyrics or language.
- Loves made outside the Blind Test (Passport, Liner Notes) don't teach the model yet,
  and unloving a track doesn't change its stored rating.
