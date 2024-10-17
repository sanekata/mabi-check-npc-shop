/*
 * 구동시 설정 필요
 * 1. KV 생성 및 변수명 `cache`로 연동
 * 2. const apiKey = "<APIKEY>"; 부분 실제 api 키 넣기
 * 3. <SITEADDR> 부분 사이트 주소로 변경하기(접속 허용할 사이트 주소)
 */
addEventListener("fetch", event => {
    event.respondWith(handleRequest(event.request));
  });
  
  async function handleRequest(request) {
    const url = new URL(request.url);
  
    // CORS 헤더 추가
    const corsHeaders = {
      "Access-Control-Allow-Origin": "<SITEADDR>",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
  
    // OPTIONS 요청에 대한 CORS 프리플라이트 처리
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders,
      });
    }
  
    // 경로에 따른 동작 처리
    if (url.pathname === "/npcshop/status") {
      return await handleNpcShopStatus(url, corsHeaders);
    } else if (url.pathname === "/npcshop/search") {
      return await handleNpcShopSearch(url, corsHeaders);
    } else {
      return new Response(
        JSON.stringify({
          error: {
            name: "NotFound",
            message: "The requested resource was not found.",
          },
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }
  
  // /npcshop/status 처리 함수
  async function handleNpcShopStatus(url, corsHeaders) {
    const npc_name = url.searchParams.get("npc_name");
    const server_name = url.searchParams.get("server_name");
    const channel = url.searchParams.get("channel");
  
    if (!npc_name || !server_name || !channel) {
      return new Response(
        JSON.stringify({
          error: {
            name: "InvalidParameters",
            message: "Missing query parameters: npc_name, server_name, or channel.",
          },
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  
    const cacheKey = `${npc_name}-${server_name}-${channel}`;
    const cachedData = await cache.get(cacheKey);
    let headers = { ...corsHeaders, "Content-Type": "application/json" };
  
    if (cachedData) {
      const data = JSON.parse(cachedData);
      const currentTime = new Date();
      const nextUpdate = new Date(data.date_shop_next_update);
  
      if (nextUpdate > currentTime) {
        headers["X-Cache"] = "HIT";
        return new Response(JSON.stringify(data), { headers });
      }
    }
  
    return await fetchAndCacheNpcData(npc_name, server_name, channel, cacheKey, corsHeaders);
  }
  
  // /npcshop/search 처리 함수
  async function handleNpcShopSearch(url, corsHeaders) {
    const mode = url.searchParams.get("mode");
    const npc_name = url.searchParams.get("npc_name");
    const server = url.searchParams.get("server_name");
    const part = url.searchParams.get("part"); // mode가 'color'일 때만 사용
    const search = url.searchParams.get("search");
  
    if (!mode || !npc_name || !server || (mode === "color" && (!part || !search))) {
      return new Response(
        JSON.stringify({
          error: {
            name: "InvalidParameters",
            message: "Missing required query parameters.",
          },
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  
    let maxChannel;
    switch (server) {
      case "류트":
        maxChannel = 44;
        break;
      case "만돌린":
        maxChannel = 16;
        break;
      case "하프":
        maxChannel = 25;
        break;
      case "울프":
        maxChannel = 16;
        break;
      default:
        return new Response(
          JSON.stringify({
            error: {
              name: "InvalidServer",
              message: `Server ${server} is not supported.`,
            },
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  
    let itemDb = [];
  
    for (let channel = 1; channel <= maxChannel; channel++) {
      const cacheKey = `${npc_name}-${server}-${channel}`;
      const cachedData = await cache.get(cacheKey);
  
      if (cachedData) {
        const data = JSON.parse(cachedData);
        const currentTime = new Date();
        const nextUpdate = new Date(data.date_shop_next_update);
  
        if (nextUpdate > currentTime) {
          itemDb.push(data);
          continue;
        }
      }
  
      // 캐시된 데이터가 만료되었거나 없을 경우 API 요청
      await fetchAndCacheNpcData(npc_name, server, channel, cacheKey, corsHeaders);
      const newData = await cache.get(cacheKey);
      itemDb.push(JSON.parse(newData));
    }
  
    if (mode === "color") {
      // color mode일 경우 part와 search를 기준으로 필터링
      const matchList = [];
      let channel = 1;
      for (const shopData of itemDb) {
        const shopTabs = shopData.shop;
  
        for (const tab of shopTabs) {
          for (const item of tab.item) {
            for (const option of item.item_option) {
              if (
                option.option_type === "아이템 색상" &&
                option.option_sub_type.toLowerCase().includes(part.toLowerCase()) &&
                compareColors(option.option_value, search)
              ) {
                matchList.push({
                  channel: channel++,
                  ...item,
                });
              }
            }
          }
        }
      }
      return new Response(
        JSON.stringify({
          shop: [{
            tab_name: "아이템 색상 검색 결과",
            item: matchList
          }]
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  
    return new Response(
      JSON.stringify({
        error: {
          name: "DataNotFound",
          message: "No valid data found after checking all channels.",
        },
      }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  
  // 색상 비교 함수: 각 숫자가 ±10 범위 내에 있는지 확인
  function compareColors(optionValue, searchValue) {
    const optionColors = optionValue.split(',').map(Number);
    const searchColors = searchValue.split(',').map(Number);
  
    if (optionColors.length !== 3 || searchColors.length !== 3) {
      return false;
    }
  
    for (let i = 0; i < 3; i++) {
      if (Math.abs(optionColors[i] - searchColors[i]) > 10) {
        return false;
      }
    }
    return true;
  }
  
  async function fetchAndCacheNpcData(npc_name, server_name, channel, cacheKey, corsHeaders) {
    const apiKey = "<APIKEY>";
    const apiUrl = `https://open.api.nexon.com/mabinogi/v1/npcshop/list?npc_name=${encodeURIComponent(
      npc_name
    )}&server_name=${encodeURIComponent(server_name)}&channel=${encodeURIComponent(channel)}`;
  
    try {
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "x-nxopen-api-key": apiKey,
        },
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        return new Response(
          JSON.stringify({
            error: {
              name: errorData.error?.name || "APIError",
              message: errorData.error?.message || "An error occurred while fetching data from Nexon API.",
            },
          }),
          { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
  
      const data = await response.json();
  
      // 캐시 저장
      await cache.put(cacheKey, JSON.stringify(data));
  
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({
          error: {
            name: "InternalServerError",
            message: error.message || "An internal server error occurred.",
          },
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }
  