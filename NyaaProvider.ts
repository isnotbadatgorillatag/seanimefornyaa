class Provider implements AnimeProvider {
    getSettings(): AnimeProviderSettings {
        return {
            canSmartSearch: true,
            smartSearchFilters: ["batch", "episodeNumber", "resolution"],
            supportsAdult: false,
            type: "main",
        }
    }

    async search(opts: AnimeSearchOptions): Promise<AnimeTorrent[]> {
        const query = opts.query || opts.media.RomajiTitle || (opts.media.EnglishTitle || "")
        return await this.fetchAndParse(query)
    }

    async smartSearch(opts: AnimeSmartSearchOptions): Promise<AnimeTorrent[]> {
        let query = opts.query || opts.media.RomajiTitle || (opts.media.EnglishTitle || "")
        if (opts.resolution) query += ` ${opts.resolution}p`
        if (opts.batch) query += " batch"
        if (opts.episodeNumber > 0) query += ` ${opts.episodeNumber}`
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

    private parseHtml(html: string): AnimeTorrent[] {
        const torrents: AnimeTorrent[] = []
        const $ = LoadDoc(html)

        $("table.torrent-list tbody tr").each((_i: number, row: any) => {
            const cells = row.find("td")
            if (cells.length < 8) return

            const titleLink = cells.eq(1).find("a").first()
            const name = titleLink.attr("title") || titleLink.text()
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
                link: viewHref.startsWith("http") ? viewHref : `https://nyaa.si${viewHref}`,
                downloadUrl: torrentHref ? (torrentHref.startsWith("http") ? torrentHref : `https://nyaa.si${torrentHref}`) : "",
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
