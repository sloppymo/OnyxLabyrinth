local path = app.params["path"]
local source = app.open(path)
local image = source.cels[1].image
print("image", image.width, image.height, image:getPixel(0, 0))
source:close()
