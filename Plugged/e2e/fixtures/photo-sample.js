// 📷 → Use sample photo → a sample, for the photo specs (issue #15).
//
// With 2 or more offered samples, Use sample photo opens the picker (#182)
// and a tile sends its sample; with one, there is no picker and the click
// sends it at once (#200). photo.js's showSamples opens the picker inside
// the click's own handler, so by the time the click returns the picker is
// either showing or never will: this clicks `id`'s tile only when it shows.

async function chooseSample(page, id = 'demo-board') {
  await page.locator('#photo-btn').click();
  await page.locator('#photo-sample').click();
  if (await page.locator('#photo-samples').isVisible()) await page.locator(`#photo-samples [data-sample="${id}"]`).click();
}

// Offers exactly `ids` on the picker (every other sample offered: false),
// before it first opens, since its tiles are built then.
const offerOnly = (page, ids) => page.evaluate(ids => {
  for (const [id, s] of Object.entries(window.PhotoSamples)) s.offered = ids.includes(id);
}, ids);

module.exports = { chooseSample, offerOnly };
