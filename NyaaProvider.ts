class Provider implements AnimeProvider {
    getSettings(): AnimeProviderSettings {
        return {
            canSmartSearch: true,
            smartSearchFilters: ["batch", "episodeNumber", "resolution"],
            supportsAdult: false,
            type: "main",
        }
    }

    private getTitle(opts: AnimeSearchOptions | AnimeSmartSearchOptions): string {
        if (opts.query && opts.query.trim()) return opts.query.trim()
        if (opts.media.romajiTitle && opts.media.romajiTitle.trim()) return opts.media.romajiTitle.trim()
        if (opts.media.englishTitle && opts.media.englishTitle.trim()) return opts.media.englishTitle.trim()
        if (opts.media.synonyms && opts.media.synonyms.length > 0) return opts.media.synonyms[0]
        return ""
    }

    async search(opts: AnimeSearchOptions): Promise<AnimeTorrent[]> {
        return await this.fetchAndParse(this.getTitle(opts))
    }

    async smartSearch(opts: AnimeSmartSearchOptions): Promise<AnimeTorrent[]> {
        let query = this.getTitle(opts)
        if (!query) return []

        if (opts.batch) {
            query += " batch"
        } else if (opts.episodeNumber > 0) {
            query += ` ${opts.episodeNumber}`
        }

        if (opts.resolution) {
            const resolution = opts.resolution.replace(/p$/i, "")
            query += ` ${resolution}p`
        }

        return await this.fetchAndParse(query)
    }

    async getLatest(): Promise<AnimeTorrent[]> {
        return await this.fetchAndParse("")
    }

    async getTorrentMagnetLink(torrent: AnimeTorrent): Promise<string> {
        return torrent.magnetLink || ""
    }

    async getTorrentInfoHash(torrent: AnimeTorrent): Promise<string> {
        if (torrent.infoHash) return torrent.infoHash
        const magnet = torrent.magnetLink || ""
        const match = magnet.match(/btih:([a-zA-Z0-9]+)/i)
        return match ? match[1].toUpperCase() : ""
    }

    private buildUrl(query: string): string {
        let url = "https://nyaa.si/?f=0&c=1_2&s=seeders&o=desc"
        if (query) url += `&q=${encodeURIComponent(query)}`
        return url
    }

    private async fetchAndParse(query: string): Promise<AnimeTorrent[]> {
        const res = await fetch(this.buildUrl(query), { method: "get" })
        if (!res || !res.ok) return []
        return this.parseHtml(await res.text())
    }

    private parseSize(sizeText: string): number {
        const match = sizeText.trim().match(/([0-9]+(?:\.[0-9]+)?)\s*(B|KiB|MiB|GiB|TiB|KB|MB|GB|TB)/i)
        if (!match) return 0
        const value = parseFloat(match[1])
        const unit = match[2].toUpperCase()
        const multipliers: { [key: string]: number } = {
            B: 1,
            KB: 1000,
            MB: 1000 ** 2,
            GB: 1000 ** 3,
            TB: 1000 ** 4,
            KIB: 1024,
            MIB: 1024 ** 2,
            GIB: 1024 ** 3,
            TIB: 1024 ** 4,
        }
        return Math.round(value * multipliers[unit])
    }

    private parseResolution(name: string): string {
        const match = name.match(/\b(2160|1440|1080|900|720|576|480|360)\s*p?\b/i)
        if (match) return `${match[1]}p`
        if (/\b(4k|uhd|3840x2160)\b/i.test(name)) return "2160p"
        if (/\b1920x1080\b/i.test(name)) return "1080p"
        if (/\b1280x720\b/i.test(name)) return "720p"
        if (/\b854x480\b/i.test(name)) return "480p"
        if (/\b640x360\b/i.test(name)) return "360p"
        return ""
    }

    private parseEpisode(name: string): number {
        let match = name.match(/\bS\d{1,2}[ ._-]*E(\d{1,4})\b/i)
        if (match) return parseInt(match[1], 10)
        match = name.match(/(?:^|[\s._\-\[])E(?:pisode)?[ ._-]?(\d{1,4})(?:$|[\s._\-\]])/i)
        if (match) return parseInt(match[1], 10)
        return -1
    }

    private getMediaTags(name: string): string {
        const tags: string[] = []
        if (/\b(dual[ -]?audio|dual[ -]?dub|dubbed|english[ -]?dub|multi[ -]?audio|multi[ -]?dub)\b/i.test(name)) tags.push("DUB")
        if (/\b(subbed|subs?|multi[ -]?subs?|multi[ -]?subtitles?|english[ -]?subs?|eng[ -]?subs?)\b/i.test(name)) tags.push("SUB")
        return tags.join(" / ")
    }

    private parseHtml(html: string): AnimeTorrent[] {
        const torrents: AnimeTorrent[] = []
        const $ = LoadDoc(html)

        $("table.torrent-list tbody tr").each((_i: number, row: any) => {
            const cells = row.find("td")
            if (cells.length < 8) return

            const titleLink = cells.eq(1).find("a").first()
            const rawTitle = titleLink.attr("title") || titleLink.text() || ""
            const name = rawTitle.trim()
            const viewHref = titleLink.attr("href") || ""
            if (!name || !viewHref) return

            const links = cells.eq(2)
            const torrentHref = links.find("a[href$='.torrent']").attr("href") || ""
            const magnetLink = links.find("a[href^='magnet:']").attr("href") || ""
            const sizeText = cells.eq(3).text().trim()
            const timestamp = cells.eq(4).attr("data-timestamp") || ""
            const date = timestamp ? new Date(parseInt(timestamp, 10) * 1000).toISOString() : new Date().toISOString()
            const seeders = parseInt(cells.eq(5).text().trim(), 10) || 0
            const leechers = parseInt(cells.eq(6).text().trim(), 10) || 0
            const downloadCount = parseInt(cells.eq(7).text().trim(), 10) || 0
            const resolution = this.parseResolution(name)
            const episodeNumber = this.parseEpisode(name)
            const isBatch = /\b(batch|complete|complete series|full series|collection)\b/i.test(name)
            const groupMatch = name.match(/^\[([^\]]+)\]/)
            const releaseGroup = groupMatch ? groupMatch[1] : ""
            const mediaTags = this.getMediaTags(name)
            const displayName = mediaTags ? `${name} [${mediaTags}]` : name
            const hashMatch = magnetLink.match(/btih:([a-zA-Z0-9]+)/i)
            const infoHash = hashMatch ? hashMatch[1].toUpperCase() : ""

            torrents.push({
                provider: "nyaa-custom",
                name: displayName,
                date,
                size: this.parseSize(sizeText),
                formattedSize: sizeText,
                seeders,
                leechers,
                downloadCount,
                link: viewHref.startsWith("http") ? viewHref : `https://nyaa.si${viewHref}`,
                downloadUrl: torrentHref ? (torrentHref.startsWith("http") ? torrentHref : `https://nyaa.si${torrentHref}`) : "",
                magnetLink,
                infoHash,
                resolution,
                isBatch,
                episodeNumber,
                releaseGroup,
                isBestRelease: false,
                confirmed: true,
            } as AnimeTorrent)
        })
        return torrents
    }
}
