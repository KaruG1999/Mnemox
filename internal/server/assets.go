package server

import "embed"

// FrontendAssets embeds the public/ HTML files for the Go binary.
// go:embed cannot traverse ".." so files are mirrored from ui/public/ into public/ here.
// The canonical source for GitHub Pages is ui/public/.
//
//go:embed public
var FrontendAssets embed.FS
