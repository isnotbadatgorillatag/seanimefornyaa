class Provider implements AnimeProvider {
    getSettings(): AnimeProviderSettings {
        return {
            canSmartSearch: true,
            smartSearchFilters: ["batch", "episodeNumber", "resolution"],
            supportsAdult: false,
            type: "main",
        }
    }

    private asString(value: any): string {
        if (value === null || value === undefined) return ""
        if (typeof value === "string") return value
        return String(value)
    }

    async search(opts: AnimeSearchOptions): Promise<AnimeTorrent[]> {
        const suppliedQuery = this.asString(opts && opts.query).trim()
        const query = suppliedQuery || this.getMediaTitle(opts && opts.media)
        return await this.fetchAndParse(query)
    }

    async smartSearch(opts: AnimeSmartSearchOptions): Promise<AnimeTorrent[]> {
        let query = this.asString(opts && opts.query).trim() || this.getMediaTitle(opts && opts.media)
        const resolution = this.asString(opts && opts.resolution).trim()
        if (resolution) query = `${query} ${resolution}`
        if (opts && opts.batch) query = `${query} batch`
        if (opts && typeof opts.episodeNumber === "number" && opts.episodeNumber > 0) {
            query = `${query} ${opts.episodeNumber}`
        }
        return await this.fetchAndParse(query)
    }

    async getLatest(): Promise<AnimeTorrent[]> {
        return await this.fetchAndParse("")
    }

    async getTorrentMagnetLink(torrent: AnimeTorrent): Promise<string> {
        return this.asString(torrent && torrent.magnetLink)
    }

    async getTorrentInfoHash(torrent: AnimeTorrent): Promise<string> {
        const existing = this.asString(torrent && torrent.infoHash).trim()
        if (existing) return existing
        const magnet = this.asString(torrent && torrent.magnetLink)
        const match = magnet.match(/btih:([a-zA-Z0-9]+)/i)
        return match ? match[1].toUpperCase() : ""
    }

    private getMediaTitle(media: Media): string {
        if (!media || !media.title) return ""
        const title = media.title as any
        return this.asString(title.romaji) || this.asString(title.english) || this.asString(title.native)
    }

    private buildUrl(query: string): string {
        const q = this.asString(query).trim()
        let url = "https://nyaa.si/?f=0&c=1_2&s=seeders&o=desc"
        if (q) url += `&q=${encodeURIComponent(q)}`
        return url
    }

    private async fetchAndParse(query: string): Promise<AnimeTorrent[]> {
        const res = await fetch(this.buildUrl(query), { method: "get" })
        if (!res || !res.ok) return []
        const html = await res.text()
        return this.parseHtml(this.asString(html))
    }

    private parseHtml(html: string): AnimeTorrent[] {
        const torrents: AnimeTorrent[] = []
        const $ = LoadDoc(this.asString(html))
        $("table.torrent-list tbody tr").each((_i: number, el: any) => {
            const row = $(el)
            const cells = row.find("td")
            if (cells.length < 8) return

            const titleLink = cells.eq(1).find("a").first()
            const name = this.asString(titleLink.attr("title") || titleLink.text()).trim()
            const viewHref = this.asString(titleLink.attr("href")).trim()
            if (!name || !viewHref) return

            const link = viewHref.startsWith("http") ? viewHref : `https://nyaa.si${viewHref}`
            const links = cells.eq(2)
            const torrentHref = this.asString(links.find("a[href$='.torrent']").attr("href")).trim()
            const downloadUrl = torrentHref ? (torrentHref.startsWith("http") ? torrentHref : `https://nyaa.si${torrentHref}`) : ""
            const magnetLink = this.asString(links.find("a[href^='magnet:']").attr("href")).trim()
            const sizeText = this.asString(cells.eq(3).text()).trim()
            const timestamp = this.asString(cells.eq(4).attr("data-timestamp")).trim()
            const date = timestamp ? new Date(parseInt(timestamp, 10) * 1000).toISOString() : new Date().toISOString()
            const seeders = parseInt(this.asString(cells.eq(5).text()).trim(), 10) || 0
            const leechers = parseInt(this.asString(cells.eq(6).text()).trim(), 10) || 0
            const downloadCount = parseInt(this.asString(cells.eq(7).text()).trim(), 10) || 0
            const resolutionMatch = name.match(/\b(360|480|576|720|900|1080|1440|2160)p\b/i)
            const resolution = resolutionMatch ? `${resolutionMatch[1]}p` : ""
            const episodeMatch = name.match(/(?:^|[\s._\-\[])E(?:pisode)?[ ._-]?(\d{1,4})(?:$|[\s._\-\]])/i)
            const episodeNumber = episodeMatch ? parseInt(episodeMatch[1], 10) : -1
            const isBatch = /\b(batch|complete|complete series)\b/i.test(name)
            const groupMatch = name.match(/^\[([^\]]+)\]/)
            const releaseGroup = groupMatch ? groupMatch[1] : ""
            const hashMatch = magnetLink.match(/btih:([a-zA-Z0-9]+)/i)
            const infoHash = hashMatch ? hashMatch[1].toUpperCase() : ""

            torrents.push({
                provider: "nyaa-custom",
                name,
                date,
                size: 0,
                formattedSize: sizeText,
                seeders,
                leechers,
                downloadCount,
                link,
                downloadUrl,
                magnetLink,
                infoHash,
                resolution,
                isBatch,
                episodeNumber,
                releaseGroup,
                isBestRelease: false,
            } as AnimeTorrent)
        })
        return torrents
    }
}
