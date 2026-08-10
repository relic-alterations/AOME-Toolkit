from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.db.models.models import Settings
import requests

router = APIRouter()

@router.get("/search")
def search_metadata(query: str, type: str = "movie", db: Session = Depends(get_db)):
    """
    Searches for metadata using OMDB for movies and TMDB for TV shows.
    """
    settings = db.query(Settings).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Settings not configured")

    results = []

    if type == "movie":
        if not settings.omdb_api_key:
            raise HTTPException(status_code=400, detail="OMDB API key not configured")
        
        # Search OMDB
        omdb_url = f"http://www.omdbapi.com/?s={requests.utils.quote(query)}&type=movie&apikey={settings.omdb_api_key}"
        try:
            resp = requests.get(omdb_url, timeout=10)
            data = resp.json()
            if data.get("Response") == "True" and "Search" in data:
                for item in data["Search"]:
                    results.append({
                        "id": item.get("imdbID"),
                        "title": item.get("Title"),
                        "year": item.get("Year"),
                        "poster": item.get("Poster") if item.get("Poster") != "N/A" else None,
                        "type": "movie"
                    })
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"OMDB Error: {e}")

    elif type == "tv":
        if not settings.tmdb_api_key:
            raise HTTPException(status_code=400, detail="TMDB API key not configured")
            
        # Search TMDB
        tmdb_url = f"https://api.themoviedb.org/3/search/tv?query={requests.utils.quote(query)}&api_key={settings.tmdb_api_key}"
        try:
            resp = requests.get(tmdb_url, timeout=10)
            data = resp.json()
            if "results" in data:
                for item in data["results"][:10]: # limit to top 10
                    year = None
                    if item.get("first_air_date"):
                        year = item["first_air_date"].split("-")[0]
                    
                    poster = None
                    if item.get("poster_path"):
                        poster = f"https://image.tmdb.org/t/p/w200{item['poster_path']}"
                        
                    results.append({
                        "id": str(item.get("id")),
                        "title": item.get("name"),
                        "year": year,
                        "poster": poster,
                        "type": "tv"
                    })
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"TMDB Error: {e}")
            
    else:
        raise HTTPException(status_code=400, detail="Invalid search type")

    return {"results": results}
