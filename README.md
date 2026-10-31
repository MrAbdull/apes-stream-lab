# Stream Health Lab: Virtual Macroinvertebrate Survey (APES)

A 3D virtual field lab that runs in any modern browser (laptops and iPads). There is no server,
no accounts and no cost. It's just a folder of web files.

## Pages
- `index.html`: the student lab
- `teacher.html`: teacher tools (create class codes, make groups, answer keys). **Don't share this link with students.**

## Putting it online (free)
The folder must be served from a website. Opening `index.html` by double-clicking won't work.
Easiest options:
1. **Netlify Drop**: go to app.netlify.com/drop and drag the `stream-lab` folder onto the page. You get a link in seconds.
2. **GitHub Pages**: upload the folder to a GitHub repository and turn on Pages in the settings.

Students need internet access while working (the 3D engine and PDF tool load from public CDNs).

## Running a lab
1. Open `teacher.html`, choose individual or group, how groups form, and standard or mystery mode, then **Create class code**.
2. Write down the **teacher key**. You need it to open answer keys.
3. Give students the class code or the student link.
4. Group labs: paste your roster to make (or randomize) groups. Each group gets a 4-character group code.
5. Students finish by downloading a **PDF report** (plus an optional CSV and an email summary to themselves) and turn it in through your LMS.
6. To grade, open the answer key with the student's email (or group code) and compare the **Lab ID** on their report.

## How it works
- Every student (or group) gets a slightly different stream, generated from their email or group code.
  Copying someone else's numbers won't match the copier's own lab.
- Progress saves automatically in the student's browser. On a different device, students use **Save file** and then
  **Continue from a save file**.
- Groups: teammates' screens don't sync live. Each member downloads a save file, and one member imports them
  (Notebook → Team) to make a combined group report with credit for each person.
- The report logs active time, an activity timeline, ID attempts and how many times the student left the lab page.

## Science notes
- Water-quality index modeled on the Izaak Walton League "Save Our Streams" method (count TYPES per tolerance group,
  weight ×3 / ×2 / ×1; Excellent >22, Good 17–22, Fair 11–16, Poor ≤10).
- Dissolved oxygen is computed from temperature-dependent saturation, so DO and temperature always agree.
- Mystery mode sources: sewage, thermal pollution, construction sediment or agricultural drainage. Each leaves a
  distinct, realistic chemical and biological signature.
