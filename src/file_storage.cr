require "baked_file_system"

class FileStorage
  extend BakedFileSystem

  bake_folder "#{__DIR__}/../public"

  # Méthode de débogage pour lister tous les fichiers inclus
  def self.list_baked_files
    puts "=== Fichiers inclus dans le binaire ==="
    {{ system("find " + __DIR__ + "/../public -type f").stringify.lines.map(&.stringify).join("\n").id }}
  end
end