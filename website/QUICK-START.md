# Quick Start Checklist - RouteMapper Website Improvements

## 🚀 Immediate Actions Required

### 1. File Uploads
- [ ] Upload `mobile-menu.css` to your server
- [ ] Upload `mobile-menu.js` to your server
- [ ] Replace existing `index.html` with new version

### 2. Update HTML References
In your `index.html`, ensure these lines exist:
```html
<link rel="stylesheet" href="mobile-menu.css" />
<script src="mobile-menu.js"></script>
```

### 3. Create Missing Assets

#### Required:
- [ ] Create `assets/video-poster.jpg` - A still frame from your intro video
  - Dimensions: Same as video (1280x720 or similar)
  - Format: JPG, optimized for web

#### Recommended (Accessibility):
- [ ] Create `assets/captions.vtt` - Video captions file
  - [How to create VTT files](https://developer.mozilla.org/en-US/docs/Web/API/WebVTT_API)
- [ ] Create `transcript.html` - Full text transcript of video

#### Should Create:
- [ ] Create `support.html` - Support/help page
- [ ] Update `terms.html`, `privacy.html`, `press.html` if they don't exist

### 4. Update Content Placeholders

#### Funding Section:
```html
<!-- Line ~300 in index.html -->
<div class="progress-fill" style="width: 32%"></div>
<p class="progress-text">$8,000 raised of $25,000 goal (32%)</p>
```
**Action**: Replace with your actual funding numbers

#### Testimonials:
```html
<!-- Lines ~245-290 in index.html -->
```
**Action**: Replace placeholder testimonials with real quotes from beta testers

#### Contact Email:
```html
<!-- Line ~495 in index.html -->
<a href="mailto:hello@routemapper.net">
```
**Action**: Replace with your actual email address

#### Social Media Links:
```html
<!-- Lines ~500-502 in index.html -->
<a href="#">Twitter</a>
<a href="#">Facebook</a>
<a href="#">Reddit</a>
```
**Action**: Add your actual social media URLs

### 5. Form Setup (Choose One)

#### Option A: Using Netlify (Recommended)
- [ ] Deploy site to Netlify
- [ ] Forms will work automatically (already configured)
- [ ] Set up email notifications in Netlify dashboard

#### Option B: Custom Backend
- [ ] Remove `data-netlify="true"` from forms
- [ ] Add your own form action/endpoint
- [ ] Update JavaScript form handler

### 6. Test Immediately

#### Desktop (Browser):
- [ ] Open in Chrome/Firefox/Safari
- [ ] Click through all navigation links
- [ ] Test video playback
- [ ] Verify all content displays correctly
- [ ] Check for any broken images/links

#### Mobile (Required):
- [ ] Test on actual iPhone/iPad
- [ ] Test on actual Android device
- [ ] Verify hamburger menu opens/closes
- [ ] Check touch interactions work
- [ ] Confirm text is readable without zooming

#### Accessibility:
- [ ] Tab through entire page with keyboard
- [ ] Press ESC when menu is open (should close)
- [ ] Test with screen reader if possible

## 🎨 Optional Customizations

### Change Colors:
1. Open `mobile-menu.css`
2. Search for `#4ade80` (primary green)
3. Replace with your brand color
4. Update `#22c55e` (dark green) as well

### Adjust Funding Goal:
Update both places:
1. HTML progress bar (line ~300)
2. Text description (line ~301)

### Add More Testimonials:
1. Copy one of the existing `<blockquote>` blocks
2. Update content
3. Paste in the testimonial-grid section

## ⚠️ Common Issues & Solutions

### Issue: Mobile menu not working
**Solution**: Ensure `mobile-menu.js` is loaded and no JavaScript errors in console

### Issue: Characters still showing as â€"
**Solution**: Save HTML file with UTF-8 encoding in your editor

### Issue: Video not loading
**Solution**: Check video file path is correct: `assets/RouteMapper-Intro-720v2.mp4`

### Issue: Styles look wrong
**Solution**: Make sure both `styles.css` AND `mobile-menu.css` are loaded

### Issue: Forms not submitting
**Solution**: Check browser console for errors; verify Netlify deployment

## 📱 Mobile Menu Troubleshooting

If mobile menu doesn't appear:
1. Check browser width is below 768px
2. Verify `mobile-menu.css` is loaded
3. Check for JavaScript errors in console
4. Clear browser cache and reload

## 🎯 Priority Order

### Must Do First:
1. ✅ Upload all 3 new files to server
2. ✅ Create video poster image
3. ✅ Update funding numbers
4. ✅ Test on mobile device

### Should Do Soon:
5. ⏱️ Replace testimonials with real quotes
6. ⏱️ Add real social media links
7. ⏱️ Update contact email
8. ⏱️ Create video captions for accessibility

### Nice to Have:
9. 💡 Create transcript page
10. 💡 Add more FAQ items
11. 💡 Customize colors to exact brand
12. 💡 Professional accessibility audit

## 📊 Before/After Comparison

### What You Had:
- ❌ No mobile menu
- ❌ Character encoding issues
- ❌ Limited social proof
- ❌ Basic FAQ
- ❌ Simple funding section
- ❌ No comparison table
- ❌ Accessibility issues

### What You Have Now:
- ✅ Full mobile menu system
- ✅ Fixed all encoding
- ✅ Testimonials section
- ✅ Enhanced FAQ (6 items)
- ✅ Progress bar & perks
- ✅ Competitive comparison
- ✅ WCAG accessibility

## 🆘 Need Help?

### Quick Checks:
1. **Nothing appears changed**: Did you upload all 3 files?
2. **Menu broken**: Check JavaScript console for errors
3. **Styles off**: Verify both CSS files are loading
4. **Mobile issues**: Test on actual device, not just resized browser

### Files You're Working With:
```
index.html          ← Replace your existing file
mobile-menu.css     ← Add this new file
mobile-menu.js      ← Add this new file
```

### Critical Links in HTML to Verify:
```html
Line ~17: <link rel="stylesheet" href="mobile-menu.css" />
Line ~515: <script src="mobile-menu.js"></script>
```

## ✨ You're Ready!

Once you complete the "Immediate Actions Required" section above, your site will be fully functional with all improvements live.

The optional customizations can be done anytime - they're not blocking.

**Estimated Time to Deploy**: 30-45 minutes for basic setup

Good luck with the launch! 🚀
