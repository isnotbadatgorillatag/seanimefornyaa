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
        const query = opts.query?.trim() || this.getMediaTitle(opts.media)
        return await this.fetchAndParse(query)
    }

    async smartSearch(opts: AnimeSmartSearchOptions): Promise<AnimeTorrent[]> {
        let query = opts.query?.trim() || this.getMediaTitle(opts.media)
        if (opts.resolution) query = `${query} ${opts.resolution}`
        if (opts.batch) query = `${query} batch`
        if (opts.episodeNumber && opts.episodeNumber > 0) query = `${query} ${opts.episodeNumber}`
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
        const match = (torrent.magnetLink || "").match(/btih:([a-zA-Z0-9]+)/i)
        return match ? match[1].toUpperCase() : ""
    }

    private getMediaTitle(media: Media): string {
        return media?.title?.romaji || media?.title?.english || media?.title?.native || ""
    }

    private buildUrl(query: string): string {
        const params = new URLSearchParams()
        params.set("f", "0")
        params.set("c", "1_2")
        if (query) params.set("q", query)
        params.set("s", "seeders")
        params.set("o", "desc")
        return `https://nyaa.si/?${params.toString()}`
    }

    private async fetchAndParse(query: string): Promise<AnimeTorrent[]> {
        const res = await fetch(this.buildUrl(query), { method: "get" })
        if (!res.ok) return []
        return this.parseHtml(await res.text())
    }

    private parseHtml(html: string): AnimeTorrent[] {
        const torrents: AnimeTorrent[] = []
        const $ = LoadDoc(html)
        $("table.torrent-list tbody tr").each((_i: number, el: any) => {
            const row = $(el)
            const cells = row.find("td")
            if (cells.length < 8) return

            const titleLink = cells.eq(1).find("a").first()
            const name = (titleLink.attr("title") || titleLink.text() || "").trim()
            const viewHref = titleLink.attr("href") || ""
            if (!name || !viewHref) return

            const link = viewHref.startsWith("http") ? viewHref : `https://nyaa.si${viewHref}`
            const links = cells.eq(2)
            const torrentHref = links.find("a[href$='.torrent']").attr("href") || ""
            const downloadUrl = torrentHref ? (torrentHref.startsWith("http") ? torrentHref : `https://nyaa.si${torrentHref}`) : ""
            const magnetLink = links.find("a[href^='magnet:']").attr("href") || ""
            const sizeText = cells.eq(3).text().trim()
            const timestamp = cells.eq(4).attr("data-timestamp")
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
