/*
 * 구동시 설정 필요
 * 1. KV 생성 및 변수명 `cache`로 연동
 * 2. const apiKey = "<APIKEY>"; 부분 실제 api 키 넣기
 * 3. <SITEADDR> 부분 사이트 주소로 변경하기(접속 허용할 사이트 주소)
 */
const apiKey = "<APIKEY>";
const siteAddr = "<SITEADDR>";

// 이 아래부터는 수정하실 필요 없습니다.
addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request));
});

const npcInfoList = [
  {
      location: "티르 코네일",
      name: "상인 네루"
  },
  {
      location: "던바튼",
      name: "상인 누누"
  },
  {
      location: "반호르",
      name: "상인 라누"
  },
  {
      location: "이멘 마하",
      name: "상인 메루"
  },
  {
      location: "탈틴",
      name: "상인 베루"
  },
  {
      location: "타라",
      name: "상인 에루"
  },
  {
      location: "카브 항구",
      name: "상인 아루"
  },
  {
      location: "벨바스트(스카하 정찰 캠프)",
      name: "상인 세누"
  },
  {
      location: "켈라 베이스 캠프",
      name: "테일로"
  },
  {
      location: "코르",
      name: "리나"
  },
  {
      location: "필리아",
      name: "켄"
  },
  {
      location: "발레스",
      name: "카디"
  },
  {
      location: "오아시스",
      name: "얼리"
  },
  {
      location: "카루 숲",
      name: "귀넥"
  },
  {
      location: "페라",
      name: "데위"
  },
  {
      location: "자르딘",
      name: "모락"
  }
];

// name 기준으로 location을 찾는 함수
function findLocationByName(name) {
  const npc = npcInfoList.find(npc => npc.name === name);
  return npc ? npc.location : false;
}

// location 기준으로 name을 찾는 함수
function findNameByLocation(location) {
  const npc = npcInfoList.find(npc => npc.location === location);
  return npc ? npc.name : false;
}

// 존재하지 않는 NPC 이름이면 장소 기준 NPC 이름을 반환하는 함수
function handleNpcName(npc_name) {
  if(findNameByLocation(npc_name) !== false) {
    return findNameByLocation(npc_name);
  } else {
    return npc_name;
  }
}

function hexToRgb(hex) {
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}` : '';
}

async function handleRequest(request) {
  const url = new URL(request.url);

  // CORS 헤더 추가
  const corsHeaders = {
    "Access-Control-Allow-Origin": siteAddr,
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
  const npc_name = handleNpcName(url.searchParams.get("npc_name"));
  const server_name = url.searchParams.get("server_name");
  const channel = url.searchParams.get("channel");
  console.log(npc_name);

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

async function fetchAndCacheNpcData(npc_name, server_name, channel, cacheKey, corsHeaders) {
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
